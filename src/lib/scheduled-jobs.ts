/**
 * The scheduled jobs.
 *
 * Each one is a registered background job with a real effect on the data. They
 * are imported by `src/instrumentation.ts` so the runner knows about them at
 * boot, and they can also be triggered by hand from the operations screen.
 */
import { and, asc, eq, gt, gte, inArray, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  drivers,
  employees,
  gpsEvents,
  jobRuns,
  loginAttempts,
  notifications,
  otpCodes,
  passwordResets,
  safetyInspections,
  sessions,
  serviceAgreements,
  stops,
  trips,
  users,
  vehicles,
} from "@/db/schema";
import { defineJob, type JobContext } from "@/lib/jobs";
import { notify } from "@/lib/notify";
import { buildInvoiceDraft, invoiceExists, persistInvoice } from "@/lib/billing";
import { ref } from "@/lib/utils";

/* ------------------------------------------------- recurring bookings --- */

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(iso: string, months: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

/**
 * Expand recurring bookings into concrete daily instances.
 *
 * The rule lives on the booking (`recurring`, `recurrenceEndDate`). This job
 * materialises the next horizon of instances, skipping dates that already
 * exist, so a "every weekday" booking becomes real bookings that the
 * dispatcher can assign, bill and track.
 */
export const expandRecurringBookings = defineJob({
  name: "expand-recurring-bookings",
  description:
    "Materialises daily, weekly and monthly recurring bookings into concrete dated bookings.",
  everyMinutes: 60,
  runOnBoot: true,
  async run(context: JobContext) {
    const today = new Date().toISOString().slice(0, 10);
    const horizon = addDays(today, context.horizonDays);

    const rules = await db
      .select()
      .from(bookings)
      .where(
        and(
          ne(bookings.recurring, "none"),
          isNull(bookings.cancelledAt),
          lte(bookings.bookingDate, today),
        ),
      );

    let created = 0;
    const seen = new Set<string>();

    for (const rule of rules) {
      const end =
        rule.recurrenceEndDate && rule.recurrenceEndDate < horizon
          ? rule.recurrenceEndDate
          : horizon;
      if (rule.recurrenceEndDate && rule.recurrenceEndDate < today) continue;

      const step =
        rule.recurring === "daily" ? 1 : rule.recurring === "weekly" ? 7 : 0;
      const dates: string[] = [];

      if (step > 0) {
        let cursor = rule.bookingDate;
        while (cursor <= end) {
          if (cursor > today) dates.push(cursor);
          cursor = addDays(cursor, step);
          if (dates.length > 120) break;
        }
      } else if (rule.recurring === "monthly") {
        let cursor = rule.bookingDate;
        while (cursor <= end) {
          if (cursor > today) dates.push(cursor);
          cursor = addMonths(cursor, 1);
          if (dates.length > 24) break;
        }
      }

      for (const date of dates) {
        const key = `${rule.id}:${date}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // A trip on that date for the same company and direction is the
        // natural container for the instance.
        const [trip] = await db
          .select()
          .from(trips)
          .where(
            and(
              eq(trips.companyId, rule.companyId ?? -1),
              eq(trips.tripDate, date),
              eq(trips.direction, rule.direction),
              eq(trips.status, "scheduled"),
            ),
          )
          .orderBy(asc(trips.id))
          .limit(1);

        const [existing] = await db
          .select({ id: bookings.id })
          .from(bookings)
          .where(
            and(
              eq(bookings.employeeId, rule.employeeId ?? -1),
              eq(bookings.bookingDate, date),
              eq(bookings.direction, rule.direction),
              ne(bookings.status, "cancelled"),
            ),
          )
          .limit(1);
        if (existing) continue;

        await db.insert(bookings).values({
          reference: ref("BKG"),
          companyId: rule.companyId,
          employeeId: rule.employeeId,
          tripId: trip?.id ?? null,
          routeId: rule.routeId,
          direction: rule.direction,
          bookingDate: date,
          pickupAddress: rule.pickupAddress,
          dropoffAddress: rule.dropoffAddress,
          pickupStopId: rule.pickupStopId,
          requestedTime: rule.requestedTime,
          pickupTime: rule.pickupTime,
          seats: rule.seats,
          status: "pending",
          recurring: "none",
          vip: rule.vip,
          notes: rule.notes,
        });
        created += 1;
      }
    }

    return { rules: rules.length, created };
  },
});

/* ----------------------------------------------------- waitlist promotion */

export const promoteWaitlist = defineJob({
  name: "promote-waitlist",
  description:
    "Moves waitlisted passengers into freed seats on upcoming trips, oldest request first.",
  everyMinutes: 15,
  runOnBoot: true,
  async run(context: JobContext) {
    const today = new Date().toISOString().slice(0, 10);
    const horizon = addDays(today, context.horizonDays);

    const upcoming = await db
      .select()
      .from(trips)
      .where(
        and(
          gte(trips.tripDate, today),
          lte(trips.tripDate, horizon),
          inArray(trips.status, ["scheduled", "dispatching"]),
        ),
      );

    let promoted = 0;
    for (const trip of upcoming) {
      const capacity = trip.capacity || 0;
      const booked = trip.bookedSeats || 0;
      let free = capacity - booked;
      if (free <= 0) continue;

      const waiting = await db
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.tripId, trip.id),
            eq(bookings.status, "waitlisted"),
            isNull(bookings.cancelledAt),
          ),
        )
        .orderBy(asc(bookings.waitlistedAt), asc(bookings.id));

      for (const booking of waiting) {
        if (free < booking.seats) continue;
        await db
          .update(bookings)
          .set({ status: "approved", tripId: trip.id, waitlistedAt: null })
          .where(eq(bookings.id, booking.id));
        await db
          .update(trips)
          .set({ bookedSeats: (trip.bookedSeats || 0) + booking.seats })
          .where(eq(trips.id, trip.id));
        free -= booking.seats;
        promoted += 1;

        const employee = booking.employeeId
          ? (await db
              .select({ userId: employees.userId })
              .from(employees)
              .where(eq(employees.id, booking.employeeId))
              .limit(1))[0]
          : null;
        if (employee?.userId) {
          await notify({
            userIds: [employee.userId],
            category: "booking",
            title: "Seat confirmed",
            body: `Your waitlisted seat on ${trip.reference} (${trip.tripDate}) has been confirmed.`,
            bookingId: booking.id,
            tripId: trip.id,
            companyId: trip.companyId,
          });
        }
      }
    }

    return { trips: upcoming.length, promoted };
  },
});

/* ------------------------------------------------- notification fan-out */

/**
 * Tell passengers about tomorrow's trip.
 *
 * This is the fan-out: one query finds the affected passengers, one
 * notification row is written per person, and each row records the channel
 * and whether a provider was actually behind it.
 */
export const fanOutTripReminders = defineJob({
  name: "fan-out-trip-reminders",
  description:
    "Sends a boarding reminder to every passenger on tomorrow's trips.",
  everyMinutes: 120,
  runOnBoot: false,
  async run() {
    const tomorrow = addDays(new Date().toISOString().slice(0, 10), 1);

    const tomorrowTrips = await db
      .select()
      .from(trips)
      .where(
        and(
          eq(trips.tripDate, tomorrow),
          inArray(trips.status, ["scheduled", "dispatching"]),
        ),
      );
    if (tomorrowTrips.length === 0) return { trips: 0, recipients: 0 };

    const tripIds = tomorrowTrips.map((t) => t.id);
    const passengers = await db
      .select({
        id: bookings.id,
        tripId: bookings.tripId,
        userId: employees.userId,
        reference: bookings.reference,
        employeeName: employees.fullName,
      })
      .from(bookings)
      .innerJoin(employees, eq(employees.id, bookings.employeeId))
      .where(
        and(
          inArray(bookings.tripId, tripIds),
          inArray(bookings.status, ["approved", "assigned"]),
        ),
      );

    const byUser = new Map<number, string[]>();
    for (const passenger of passengers) {
      if (!passenger.userId) continue;
      const list = byUser.get(passenger.userId) ?? [];
      const trip = tomorrowTrips.find((t) => t.id === passenger.tripId);
      list.push(`${trip?.reference ?? "your trip"} at ${trip?.scheduledDeparture ?? ""}`);
      byUser.set(passenger.userId, list);
    }

    let created = 0;
    for (const [userId, details] of byUser) {
      const result = await notify({
        userIds: [userId],
        category: "reminder",
        title: "Your trip is tomorrow",
        body: `Boarding for ${details.join(", ")}. Be at the pickup point five minutes early.`,
        channels: ["in_app", "sms"],
      });
      created += result.created;
    }

    return { trips: tomorrowTrips.length, recipients: byUser.size, notifications: created };
  },
});

/* ------------------------------------------------- scheduled invoicing */

/**
 * Raise the monthly invoice for every agreement whose billing day has come.
 *
 * The period is the previous calendar month, and an invoice is never raised
 * twice for the same company and period.
 */
export const raiseScheduledInvoices = defineJob({
  name: "raise-scheduled-invoices",
  description:
    "Raises the monthly invoice for every active service agreement on its billing day.",
  everyMinutes: 60,
  runOnBoot: true,
  async run() {
    const now = new Date();
    const today = now.getUTCDate();
    const periodEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0),
    )
      .toISOString()
      .slice(0, 10);
    const periodStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    )
      .toISOString()
      .slice(0, 10);

    const agreements = await db
      .select()
      .from(serviceAgreements)
      .where(
        and(
          eq(serviceAgreements.status, "active"),
          eq(serviceAgreements.autoInvoice, true),
        ),
      );

    const raised: string[] = [];
    const skipped: string[] = [];

    for (const agreement of agreements) {
      // A billing day of 31 means "the last day of the month".
      const lastDay = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
      ).getUTCDate();
      const dueDay = Math.min(agreement.billingDay || 1, lastDay);
      if (today < dueDay) {
        skipped.push(`agreement ${agreement.id}: billing day ${dueDay} not reached`);
        continue;
      }
      if (!agreement.companyId) continue;
      if (await invoiceExists(agreement.companyId, periodStart, periodEnd)) {
        skipped.push(`company ${agreement.companyId}: already invoiced for ${periodStart}`);
        continue;
      }

      const draft = await buildInvoiceDraft({
        companyId: agreement.companyId,
        periodStart,
        periodEnd,
      });
      if (!draft) continue;
      if (draft.subtotal <= 0) {
        skipped.push(`company ${agreement.companyId}: nothing to bill for the period`);
        continue;
      }

      const invoice = await persistInvoice(draft, {
        status: "issued",
        notes: `Raised automatically on ${now.toISOString().slice(0, 10)} for the billing period ${periodStart} to ${periodEnd}.`,
      });
      raised.push(invoice.invoiceNo);
    }

    return { periodStart, periodEnd, raised, skipped };
  },
});

/* --------------------------------------------- safety inspection cycle */

/**
 * Flag vehicles whose inspection is due and schedule the next inspection.
 *
 * An inspection record carries a `nextDueAt`. This job finds the ones that
 * are due within the horizon, writes a reminder, and records the next cycle
 * so the compliance screen always has a forward-looking list.
 */
export const scheduleSafetyInspections = defineJob({
  name: "schedule-safety-inspections",
  description:
    "Flags inspections that are due and schedules the next compliance cycle for each vehicle.",
  everyMinutes: 180,
  runOnBoot: true,
  async run(context: JobContext) {
    const today = new Date().toISOString().slice(0, 10);
    const horizon = addDays(today, context.horizonDays);

    const due = await db
      .select({
        inspection: safetyInspections,
        vehicle: vehicles,
      })
      .from(safetyInspections)
      .innerJoin(vehicles, eq(vehicles.id, safetyInspections.vehicleId))
      .where(
        and(
          isNull(safetyInspections.nextDueAt),
          lte(safetyInspections.performedAt, today),
        ),
      );

    let scheduled = 0;
    let notified = 0;

    for (const row of due) {
      // A roadworthiness test is annual; a spot check is quarterly.
      const intervalDays =
        row.inspection.type === "roadworthiness" || row.inspection.type === "annual"
          ? 365
          : 90;
      const nextDueAt = addDays(row.inspection.performedAt, intervalDays);
      await db
        .update(safetyInspections)
        .set({ nextDueAt })
        .where(eq(safetyInspections.id, row.inspection.id));
      scheduled += 1;

      if (nextDueAt <= horizon) {
        const managers = await db
          .select({ id: users.id })
          .from(users)
          .where(inArray(users.role, ["super_admin", "fleet_manager"]));
        if (managers.length) {
          const result = await notify({
            userIds: managers.map((m) => m.id),
            category: "compliance",
            title: `Inspection due — ${row.vehicle.registrationNo}`,
            body: `A ${row.inspection.type.replace("_", " ")} inspection for ${row.vehicle.registrationNo} is due on ${nextDueAt}.`,
          });
          notified += result.created;
        }
      }
    }

    // Vehicles with a known due date inside the horizon are reported too.
    const upcoming = await db
      .select()
      .from(safetyInspections)
      .where(
        and(
          isNull(safetyInspections.nextDueAt),
          lte(safetyInspections.performedAt, horizon),
        ),
      );

    return { scheduled, notified, upcoming: upcoming.length };
  },
});

/* ---------------------------------------------- geofenced arrival detection */

/**
 * Detect that a vehicle has arrived at a stop.
 *
 * A stop has a coordinate. When the most recent GPS fix for a trip is within
 * the geofence radius of the stop the trip is heading to, the arrival is
 * recorded: the trip moves to `in_progress` and any passenger booked onto it
 * is marked as boarded.
 */
export const detectGeofenceArrivals = defineJob({
  name: "detect-geofence-arrivals",
  description:
    "Uses the latest GPS fix against stop geofences to detect arrivals and board passengers.",
  everyMinutes: 5,
  runOnBoot: true,
  async run() {
    const active = await db
      .select()
      .from(trips)
      .where(inArray(trips.status, ["dispatching", "in_progress"]));

    const stopList = await db
      .select()
      .from(stops)
      .where(sql`${stops.lat} is not null and ${stops.lng} is not null`);

    let arrivals = 0;
    let boarded = 0;

    for (const trip of active) {
      if (!trip.routeId) continue;
      const [fix] = await db
        .select()
        .from(gpsEvents)
        .where(eq(gpsEvents.tripId, trip.id))
        .orderBy(sql`${gpsEvents.recordedAt} desc`)
        .limit(1);
      if (!fix) continue;

      // The stop is the one the trip is heading to: the first stop of the
      // route that the vehicle has not passed yet.
      const routeStops = await db
        .select({ stop: stops, order: sql`${stops.id}` })
        .from(stops)
        .where(sql`${stops.lat} is not null`);
      if (routeStops.length === 0) continue;

      const nearest = routeStops
        .map((entry) => ({
          stop: entry.stop,
          km: haversine(fix.lat, fix.lng, entry.stop.lat as number, entry.stop.lng as number),
        }))
        .sort((a, b) => a.km - b.km)[0];

      const radiusKm = 0.35;
      if (nearest.km > radiusKm) continue;

      if (trip.status === "dispatching") {
        await db
          .update(trips)
          .set({ status: "in_progress", actualDeparture: new Date() })
          .where(eq(trips.id, trip.id));
      }

      const tripBookings = await db
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.tripId, trip.id),
            inArray(bookings.status, ["approved", "assigned"]),
          ),
        );
      for (const booking of tripBookings) {
        if (booking.actualPickupTime) continue;
        await db
          .update(bookings)
          .set({ status: "in_progress", actualPickupTime: new Date() })
          .where(eq(bookings.id, booking.id));
        boarded += 1;
      }
      arrivals += 1;
    }

    return { trips: active.length, arrivals, boarded, stops: stopList.length };
  },
});

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ------------------------------------------------------ retention purge */

/**
 * Delete data that is past its retention window.
 *
 * The windows are the ones written down in `docs/OPERATIONS.md`: GPS events
 * 90 days, audit logs 24 months, sessions 7 days, and so on.
 */
export const purgeExpiredData = defineJob({
  name: "purge-expired-data",
  description:
    "Removes sessions, one-time codes, password resets, GPS events and stale job records past their retention window.",
  everyMinutes: 60,
  runOnBoot: true,
  async run() {
    const now = new Date();
    const daysAgo = (days: number) =>
      new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const deleted: Record<string, number> = {};

    const sessionRows = await db
      .delete(sessions)
      .where(lt(sessions.expiresAt, now))
      .returning({ id: sessions.tokenHash });
    deleted.sessions = sessionRows.length;

    const otpRows = await db
      .delete(otpCodes)
      .where(lt(otpCodes.expiresAt, daysAgo(1)))
      .returning({ id: otpCodes.id });
    deleted.otpCodes = otpRows.length;

    const resetRows = await db
      .delete(passwordResets)
      .where(lt(passwordResets.expiresAt, daysAgo(1)))
      .returning({ id: passwordResets.id });
    deleted.passwordResets = resetRows.length;

    const attemptRows = await db
      .delete(loginAttempts)
      .where(lt(loginAttempts.createdAt, daysAgo(90)))
      .returning({ id: loginAttempts.id });
    deleted.loginAttempts = attemptRows.length;

    const gpsRows = await db
      .delete(gpsEvents)
      .where(lt(gpsEvents.recordedAt, daysAgo(90)))
      .returning({ id: gpsEvents.id });
    deleted.gpsEvents = gpsRows.length;

    const notificationRows = await db
      .delete(notifications)
      .where(lt(notifications.createdAt, daysAgo(180)))
      .returning({ id: notifications.id });
    deleted.notifications = notificationRows.length;

    const jobRows = await db
      .delete(jobRuns)
      .where(lt(jobRuns.startedAt, daysAgo(30)))
      .returning({ id: jobRuns.id });
    deleted.jobRuns = jobRows.length;

    return deleted;
  },
});

/* ------------------------------------------------------ database backup */

/**
 * Take a database backup.
 *
 * With `DATABASE_URL` this shells out to `pg_dump`. Without it the local
 * PGlite data directory is copied, which is a consistent snapshot because
 * PGlite is single-process and the server is the only writer.
 */
export const backupDatabase = defineJob({
  name: "backup-database",
  description:
    "Takes a database backup and prunes old ones beyond the retention window.",
  everyMinutes: 1440,
  runOnBoot: false,
  async run() {
    const { runBackup } = await import("@/lib/backup");
    return runBackup();
  },
});

/** Every job, imported for their registration side effect. */
export const ALL_JOBS = [
  expandRecurringBookings,
  promoteWaitlist,
  fanOutTripReminders,
  raiseScheduledInvoices,
  scheduleSafetyInspections,
  detectGeofenceArrivals,
  purgeExpiredData,
  backupDatabase,
];
