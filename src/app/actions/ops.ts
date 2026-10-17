"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  branches,
  companies,
  driverEarnings,
  drivers,
  employees,
  boardings,
  feedback,
  gpsEvents,
  incidents,
  notifications,
  routes,
  serviceAgreements,
  shifts,
  trips,
  users,
  vehicles,
} from "@/db/schema";
import type { ActionState } from "@/components/action-form";
import { PermissionError, withAction } from "@/lib/action-guard";
import { logAudit, requireUser } from "@/lib/auth";
import { can, type Role } from "@/lib/rbac";
import {
  canAssignToTrip,
  canTransition,
  computeDriverPay,
  departureTimeForShift,
  planRoute,
  recommendDriver,
  recommendVehicle,
  validateBooking,
  type GeoPoint,
} from "@/lib/domain";
import { generateOtp, getSessionUser } from "@/lib/auth";
import { ref, todayISO } from "@/lib/utils";

/**
 * Form readers.
 *
 * Every value that reaches the database passes through one of these, so a
 * malformed submission is rejected as "missing" rather than crashing the query
 * with NaN. `num` returns `null` for anything that is not a finite number;
 * `str` drops values that exceed the length cap for the column.
 */
const str = (fd: FormData, k: string, max = 500) => {
  const raw = String(fd.get(k) ?? "").trim();
  return raw.length > max ? "" : raw;
};
const num = (fd: FormData, k: string) => {
  const raw = str(fd, k);
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

async function guard(permission: Parameters<typeof can>[1]) {
  const user = await requireUser();
  if (!can(user.role as Role, permission))
    throw new PermissionError("You do not have permission to perform this action.");
  return user;
}

async function notify(userIds: number[], title: string, body: string, category: string, bookingId?: number, tripId?: number) {
  if (!userIds.length) return;
  await db.insert(notifications).values(
    userIds.map((userId) => ({ userId, title, body, category, bookingId: bookingId ?? null, tripId: tripId ?? null })),
  );
}

/* ---------------------------------------------------------------- trips */

async function createTripAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("trip.manage");
  const companyId = num(fd, "companyId");
  const tripDate = str(fd, "tripDate") || todayISO();
  const departure = str(fd, "scheduledDeparture");
  if (!companyId || !departure) return { ok: false, message: "Company, date and departure time are required." };

  const vehicleId = num(fd, "vehicleId");
  const driverId = num(fd, "driverId");

  let capacity = num(fd, "capacity") ?? 0;
  if (vehicleId) {
    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1);
    if (!vehicle) return { ok: false, message: "Vehicle not found." };
    if (["under_maintenance", "out_of_service"].includes(vehicle.status)) {
      return { ok: false, message: `${vehicle.registrationNo} is ${vehicle.status.replace("_", " ")} and cannot be assigned.` };
    }
    capacity = vehicle.capacity;
    await db.update(vehicles).set({ status: "assigned" }).where(eq(vehicles.id, vehicleId));
  }
  if (driverId) {
    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
    if (!driver) return { ok: false, message: "Driver not found." };
    if (driver.status === "unavailable") return { ok: false, message: `${driver.fullName} is marked unavailable.` };
  }

  const [created] = await db
    .insert(trips)
    .values({
      reference: ref("TRP"),
      companyId,
      branchId: num(fd, "branchId"),
      routeId: num(fd, "routeId"),
      vehicleId,
      driverId,
      direction: (str(fd, "direction") || "home_to_office") as "home_to_office",
      tripDate,
      scheduledDeparture: new Date(`${tripDate}T${departure}:00Z`),
      scheduledArrival: str(fd, "scheduledArrival") ? new Date(`${tripDate}T${str(fd, "scheduledArrival")}:00Z`) : null,
      capacity,
      plannedKm: num(fd, "plannedKm") ?? 0,
      status: "scheduled",
      createdById: user.id,
      notes: str(fd, "notes") || null,
    })
    .returning({ id: trips.id, reference: trips.reference });

  await logAudit({ user, action: "trip.create", entity: "trip", entityId: created.id, companyId, details: { vehicleId, driverId } });
  revalidatePath("/trips");
  revalidatePath("/dispatch");
  return { ok: true, message: `Trip ${created.reference} created.` };
}

async function assignResourcesAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("trip.dispatch");
  const tripId = num(fd, "tripId");
  if (!tripId) return { ok: false, message: "Missing trip." };
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) return { ok: false, message: "Trip not found." };

  const vehicleId = num(fd, "vehicleId");
  const driverId = num(fd, "driverId");

  if (vehicleId) {
    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1);
    if (!vehicle) return { ok: false, message: "Vehicle not found." };
    if (["under_maintenance", "out_of_service"].includes(vehicle.status)) {
      return { ok: false, message: `${vehicle.registrationNo} cannot be assigned (status: ${vehicle.status}).` };
    }
    if (vehicle.capacity < trip.bookedSeats) {
      return { ok: false, message: `${vehicle.registrationNo} holds ${vehicle.capacity} seats but ${trip.bookedSeats} passengers are booked.` };
    }
  }
  if (driverId) {
    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
    if (!driver) return { ok: false, message: "Driver not found." };
    if (driver.status === "unavailable") return { ok: false, message: `${driver.fullName} is unavailable.` };
  }

  await db
    .update(trips)
    .set({
      vehicleId: vehicleId ?? trip.vehicleId,
      driverId: driverId ?? trip.driverId,
      capacity: vehicleId ? (await db.select({ capacity: vehicles.capacity }).from(vehicles).where(eq(vehicles.id, vehicleId)))[0].capacity : trip.capacity,
      status: trip.status === "scheduled" ? "dispatching" : trip.status,
    })
    .where(eq(trips.id, tripId));

  if (vehicleId) await db.update(vehicles).set({ status: "assigned" }).where(eq(vehicles.id, vehicleId));
  if (driverId) {
    await db.update(drivers).set({ status: "on_trip" }).where(eq(drivers.id, driverId));
    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
    if (driver?.userId) {
      await notify([driver.userId], `New assignment: trip ${trip.reference}`, "Open the driver app to review the passenger manifest.", "trip");
    }
  }

  await logAudit({ user, action: "trip.assign_resources", entity: "trip", entityId: tripId, companyId: trip.companyId, details: { vehicleId, driverId } });
  revalidatePath("/trips");
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/dispatch");
  return { ok: true, message: "Vehicle and driver assigned." };
}

async function updateTripStatusAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("trip.dispatch");
  const tripId = num(fd, "tripId");
  const next = str(fd, "status");
  if (!tripId || !next) return { ok: false, message: "Missing trip or status." };
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) return { ok: false, message: "Trip not found." };
  if (!canTransition(trip.status, next)) {
    return { ok: false, message: `Cannot move a trip from ${trip.status.replace("_", " ")} to ${next.replace("_", " ")}.` };
  }

  const now = new Date();
  const patch: Partial<typeof trips.$inferInsert> = { status: next as "completed" };
  if (next === "in_progress") {
    patch.actualDeparture = trip.actualDeparture ?? now;
    if (trip.vehicleId) await db.update(vehicles).set({ status: "on_trip" }).where(eq(vehicles.id, trip.vehicleId));
    if (trip.driverId) await db.update(drivers).set({ status: "on_trip" }).where(eq(drivers.id, trip.driverId));
    await db.update(bookings).set({ status: "in_progress" }).where(and(eq(bookings.tripId, tripId), inArray(bookings.status, ["assigned", "approved"])));
  }
  if (next === "completed") {
    patch.actualArrival = now;
    if (trip.vehicleId) await db.update(vehicles).set({ status: "available" }).where(eq(vehicles.id, trip.vehicleId));
    if (trip.driverId) {
      await db.update(drivers).set({ status: "available" }).where(eq(drivers.id, trip.driverId));
      const [driver] = await db.select().from(drivers).where(eq(drivers.id, trip.driverId)).limit(1);
      const overtime = Math.max(0, Math.round((now.getTime() - new Date(trip.scheduledArrival ?? trip.scheduledDeparture).getTime()) / 60000));
      const pay = computeDriverPay({
        basePay: 85,
        allowance: Number(driver?.tripAllowance ?? 35),
        overtimeMinutes: overtime,
        overtimeRatePerHour: 30,
      });
      await db.insert(driverEarnings).values({
        driverId: trip.driverId,
        tripId: trip.id,
        periodStart: trip.tripDate,
        periodEnd: trip.tripDate,
        basePay: "85.00",
        overtimePay: String(pay.overtimePay),
        allowance: String(Number(driver?.tripAllowance ?? 35)),
        total: String(pay.total),
        status: "accrued",
      });
    }
    await db
      .update(bookings)
      .set({ status: "completed" })
      .where(and(eq(bookings.tripId, tripId), inArray(bookings.status, ["assigned", "approved", "in_progress"])));
  }
  if (next === "cancelled") {
    if (trip.vehicleId) await db.update(vehicles).set({ status: "available" }).where(eq(vehicles.id, trip.vehicleId));
    if (trip.driverId) await db.update(drivers).set({ status: "available" }).where(eq(drivers.id, trip.driverId));
    await db
      .update(bookings)
      .set({ status: "approved", tripId: null, cancelledAt: null })
      .where(and(eq(bookings.tripId, tripId), inArray(bookings.status, ["assigned", "approved", "in_progress"])));
  }

  await db.update(trips).set(patch).where(eq(trips.id, tripId));
  await logAudit({ user, action: `trip.${next}`, entity: "trip", entityId: tripId, companyId: trip.companyId });
  revalidatePath("/trips");
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/dispatch");
  revalidatePath("/driver");
  return { ok: true, message: `Trip ${trip.reference} marked ${next.replace("_", " ")}.` };
}

async function recordPositionAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const role = user.role as Role;
  const isDriver = role === "driver";

  // A dispatcher or an administrator may log a position for any trip. A
  // driver may only log one for a trip that is assigned to them — the same
  // ownership check the rest of the driver app uses.
  if (!isDriver && !can(role, "trip.dispatch")) {
    throw new PermissionError("You do not have permission to perform this action.");
  }

  const tripId = num(fd, "tripId");
  const lat = num(fd, "lat");
  const lng = num(fd, "lng");
  if (!tripId || lat == null || lng == null) return { ok: false, message: "Trip, latitude and longitude are required." };
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) return { ok: false, message: "Trip not found." };

  if (isDriver) {
    const [driver] = await db.select().from(drivers).where(eq(drivers.userId, user.id)).limit(1);
    if (!driver) return { ok: false, message: "No driver record linked to your account." };
    if (trip.driverId !== driver.id) {
      return { ok: false, message: "This trip is not assigned to you." };
    }
  }

  await db.insert(gpsEvents).values({
    tripId,
    vehicleId: trip.vehicleId,
    lat,
    lng,
    speedKph: num(fd, "speedKph") ?? 0,
    heading: num(fd, "heading") ?? 0,
    source: isDriver ? "driver_app_manual" : "dispatcher_demo",
  });
  revalidatePath("/dispatch");
  revalidatePath(`/driver/trip/${tripId}`);
  return {
    ok: true,
    message: isDriver
      ? `Position sent for ${trip.reference}.`
      : `Position logged for ${trip.reference} (demo GPS source).`,
  };
}

/* -------------------------------------------------------- route planning */

/**
 * Groups approved bookings into capacity-aware trips.
 * Zone clustering + nearest-neighbour sequencing + vehicle/driver recommendation.
 */
async function planTripsAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("trip.dispatch");
  const tripDate = str(fd, "tripDate") || todayISO();
  const direction = (str(fd, "direction") || "home_to_office") as "home_to_office" | "office_to_home";
  const companyFilter = num(fd, "companyId");

  const candidates = await db
    .select({ booking: bookings, employee: employees, shift: shifts })
    .from(bookings)
    .innerJoin(employees, eq(employees.id, bookings.employeeId))
    .leftJoin(shifts, eq(shifts.id, employees.shiftId))
    .where(
      and(
        eq(bookings.bookingDate, tripDate),
        eq(bookings.direction, direction),
        inArray(bookings.status, ["approved", "pending", "waitlisted"]),
        companyFilter ? eq(bookings.companyId, companyFilter) : undefined,
      ),
    );
  if (!candidates.length) {
    return { ok: false, message: `No approved ${direction.replace(/_/g, " ")} bookings for ${tripDate}.` };
  }

  const fleet = await db.select().from(vehicles).where(eq(vehicles.status, "available"));
  const driverPool = await db.select().from(drivers).where(eq(drivers.status, "available"));

  const usedVehicles = new Set<number>();
  const usedDrivers = new Set<number>();
  const created: string[] = [];
  let assigned = 0;
  let waitlisted = 0;

  // group by company then zone
  const byCompany = new Map<number, typeof candidates>();
  for (const c of candidates) {
    const list = byCompany.get(c.booking.companyId) ?? [];
    list.push(c);
    byCompany.set(c.booking.companyId, list);
  }

  for (const [companyId, list] of byCompany) {
    const [branch] = await db
      .select()
      .from(branches)
      .where(eq(branches.companyId, companyId))
      .limit(1);
    const office: GeoPoint = {
      id: 0,
      name: branch?.name ?? "Office",
      lat: branch?.lat ?? 5.6037,
      lng: branch?.lng ?? -0.187,
    };

    const zoneGroups = new Map<string, typeof candidates>();
    for (const c of list) {
      const key = c.employee.zone ?? "Unzoned";
      zoneGroups.set(key, [...(zoneGroups.get(key) ?? []), c]);
    }

    for (const [zone, group] of zoneGroups) {
      let remaining = [...group];
      while (remaining.length) {
        const vehicle = recommendVehicle(
          fleet.filter((v) => !usedVehicles.has(v.id)).map((v) => ({ ...v, costPerKm: Number(v.costPerKm) })),
          remaining.length,
        );
        const driver = recommendDriver(driverPool.filter((d) => !usedDrivers.has(d.id)));
        if (!vehicle || !driver) {
          // no capacity left: keep the rest on the waiting list
          for (const c of remaining) {
            await db.update(bookings).set({ status: "waitlisted" }).where(eq(bookings.id, c.booking.id));
            waitlisted += 1;
          }
          remaining = [];
          continue;
        }

        const seats = Math.min(vehicle.capacity, remaining.length);
        const passengers = remaining.slice(0, seats);
        const points: GeoPoint[] = passengers
          .filter((p) => p.employee.homeLat != null && p.employee.homeLng != null)
          .map((p) => ({ id: p.employee.id, name: p.employee.fullName, lat: p.employee.homeLat!, lng: p.employee.homeLng! }));

        const plan = points.length
          ? planRoute(points, office, { direction, avgSpeedKph: direction === "home_to_office" ? 26 : 30, minutesPerStop: 3 })
          : { stops: [], totalKm: Number(12), totalMinutes: 45 };

        const shiftStart = passengers[0].shift?.startTime ?? (direction === "home_to_office" ? "08:00" : "17:30");
        const departure = departureTimeForShift(shiftStart, plan.totalMinutes, direction === "home_to_office" ? 10 : 0);
        const [hh, mm] = departure.split(":").map(Number);
        const departureAt = new Date(`${tripDate}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`);
        const arrivalAt = new Date(departureAt.getTime() + plan.totalMinutes * 60000);

        const [route] = await db
          .select()
          .from(routes)
          .where(and(eq(routes.companyId, companyId), eq(routes.direction, direction)))
          .limit(1);

        const [trip] = await db
          .insert(trips)
          .values({
            reference: ref("TRP"),
            companyId,
            branchId: branch?.id ?? null,
            routeId: route?.id ?? null,
            vehicleId: vehicle.id,
            driverId: driver.id,
            direction,
            tripDate,
            scheduledDeparture: departureAt,
            scheduledArrival: arrivalAt,
            capacity: vehicle.capacity,
            bookedSeats: passengers.length,
            plannedKm: plan.totalKm,
            status: "scheduled",
            createdById: user.id,
            notes: `Auto-planned ${zone} cluster · ${plan.totalKm} km estimated`,
          })
          .returning({ id: trips.id, reference: trips.reference });

        usedVehicles.add(vehicle.id);
        usedDrivers.add(driver.id);
        await db.update(vehicles).set({ status: "assigned" }).where(eq(vehicles.id, vehicle.id));
        await db.update(drivers).set({ status: "available" }).where(eq(drivers.id, driver.id));

        const stops = plan.stops;
        for (const p of passengers) {
          const stop = stops.find((s) => s.point.id === p.employee.id);
          const pickupTime = stop
            ? new Date(departureAt.getTime() + stop.offsetMinutes * 60000).toISOString().slice(11, 16)
            : departure;
          await db
            .update(bookings)
            .set({ tripId: trip.id, status: "assigned", pickupTime, routeId: route?.id ?? null })
            .where(eq(bookings.id, p.booking.id));
          assigned += 1;
          if (p.employee.userId) {
            await notify(
              [p.employee.userId],
              `Pickup confirmed at ${pickupTime}`,
              `Vehicle ${vehicle.registrationNo} · driver ${driver.fullName}. Trip ${trip.reference}.`,
              "booking",
              p.booking.id,
              trip.id,
            );
          }
        }
        if (driver.userId) {
          await notify([driver.userId], `Assignment for ${tripDate}`, `Trip ${trip.reference} departing ${departure} with ${passengers.length} passengers.`, "trip", undefined, trip.id);
        }
        created.push(trip.reference);
        remaining = remaining.slice(seats);
      }
    }
  }

  await logAudit({
    user,
    action: "planning.run",
    entity: "trip",
    details: { tripDate, direction, created: created.length, assigned, waitlisted },
  });
  revalidatePath("/trips");
  revalidatePath("/dispatch");
  revalidatePath("/bookings");
  return {
    ok: true,
    message: `Planned ${created.length} trip(s): ${assigned} passengers assigned${waitlisted ? `, ${waitlisted} kept on the waiting list` : ""}. References: ${created.join(", ") || "none"}.`,
  };
}

/* -------------------------------------------------------------- bookings */

async function decideBookingAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("booking.approve");
  const bookingId = num(fd, "bookingId");
  const decision = str(fd, "decision");
  if (!bookingId || !decision) return { ok: false, message: "Missing booking or decision." };
  const [row] = await db
    .select({ booking: bookings, employee: employees })
    .from(bookings)
    .innerJoin(employees, eq(employees.id, bookings.employeeId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) return { ok: false, message: "Booking not found." };

  if (decision === "approve" || decision === "waitlist" || decision === "reject") {
    const status = decision === "approve" ? "approved" : decision === "waitlist" ? "waitlisted" : "rejected";
    await db
      .update(bookings)
      .set({ status, approvedById: user.id, cancelReason: decision === "reject" ? str(fd, "reason") || "Not approved" : null })
      .where(eq(bookings.id, bookingId));
    if (row.employee.userId) {
      await notify(
        [row.employee.userId],
        `Booking ${status}`,
        `Reference ${row.booking.reference}: ${status === "approved" ? "approved and queued for route planning." : status === "waitlisted" ? "added to the waiting list." : "not approved."}`,
        "booking",
        bookingId,
      );
    }
    await logAudit({ user, action: `booking.${decision}`, entity: "booking", entityId: bookingId, companyId: row.booking.companyId });
    revalidatePath("/bookings");
    return { ok: true, message: `Booking ${row.booking.reference} ${status}.` };
  }

  if (decision === "cancel") {
    await db
      .update(bookings)
      .set({ status: "cancelled", cancelledAt: new Date(), cancelReason: str(fd, "reason") || "Cancelled by operator" })
      .where(eq(bookings.id, bookingId));
    if (row.booking.tripId) {
      await db
        .update(trips)
        .set({ bookedSeats: sql`greatest(0, ${trips.bookedSeats} - ${row.booking.seats})` })
        .where(eq(trips.id, row.booking.tripId));
    }
    if (row.employee.userId) {
      await notify([row.employee.userId], "Booking cancelled", `Reference ${row.booking.reference} has been cancelled.`, "booking", bookingId);
    }
    await logAudit({ user, action: "booking.cancel", entity: "booking", entityId: bookingId, companyId: row.booking.companyId });
    revalidatePath("/bookings");
    revalidatePath("/trips");
    return { ok: true, message: "Booking cancelled." };
  }

  return { ok: false, message: "Unknown decision." };
}

async function moveBookingAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("trip.dispatch");
  const bookingId = num(fd, "bookingId");
  const tripId = num(fd, "tripId");
  if (!bookingId || !tripId) return { ok: false, message: "Booking and target trip are required." };

  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking) return { ok: false, message: "Booking not found." };
  const [target] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!target) return { ok: false, message: "Target trip not found." };
  if (target.tripDate !== booking.bookingDate) return { ok: false, message: "Target trip is on a different date." };

  const check = canAssignToTrip(
    { id: target.id, capacity: target.capacity, bookedSeats: target.bookedSeats, status: target.status, tripDate: target.tripDate, direction: target.direction },
    booking.seats,
    booking.bookingDate,
  );
  if (!check.ok) return { ok: false, message: check.reason };

  if (booking.tripId) {
    await db
      .update(trips)
      .set({ bookedSeats: sql`greatest(0, ${trips.bookedSeats} - ${booking.seats})` })
      .where(eq(trips.id, booking.tripId));
  }
  await db.update(bookings).set({ tripId, status: "assigned" }).where(eq(bookings.id, bookingId));
  await db
    .update(trips)
    .set({ bookedSeats: sql`${trips.bookedSeats} + ${booking.seats}` })
    .where(eq(trips.id, tripId));

  const [employee] = await db.select().from(employees).where(eq(employees.id, booking.employeeId)).limit(1);
  if (employee?.userId) {
    await notify([employee.userId], "Your transport has been rearranged", `You have been moved to trip ${target.reference}.`, "booking", bookingId, tripId);
  }
  await logAudit({ user, action: "booking.move", entity: "booking", entityId: bookingId, companyId: booking.companyId, details: { toTrip: tripId } });
  revalidatePath("/bookings");
  revalidatePath("/trips");
  return { ok: true, message: `Booking moved to trip ${target.reference}.` };
}

/* ------------------------------------------------------------ incidents */

async function createIncidentAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!can(user.role as Role, "incident.report")) return { ok: false, message: "Not permitted." };
  const description = str(fd, "description");
  const type = str(fd, "type") || "delay";
  if (!description) return { ok: false, message: "Describe what happened." };
  const tripId = num(fd, "tripId");
  let companyId = user.companyId ?? num(fd, "companyId");
  let vehicleId = num(fd, "vehicleId");
  let driverId = num(fd, "driverId");
  if (tripId) {
    const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
    if (trip) {
      companyId = companyId ?? trip.companyId;
      vehicleId = vehicleId ?? trip.vehicleId;
      driverId = driverId ?? trip.driverId;
      if (type === "breakdown" || type === "accident") {
        await db.update(trips).set({ status: type === "breakdown" ? "breakdown" : "in_progress" }).where(eq(trips.id, tripId));
      }
    }
  }
  const [created] = await db
    .insert(incidents)
    .values({
      companyId: companyId ?? null,
      tripId,
      vehicleId,
      driverId,
      reportedById: user.id,
      type: type as "breakdown",
      severity: (str(fd, "severity") || "medium") as "medium",
      description,
      location: str(fd, "location") || null,
      status: "open",
    })
    .returning({ id: incidents.id });

  const dispatchers = await db.select({ id: users.id }).from(users).where(eq(users.role, "dispatcher"));
  if (dispatchers.length) {
    await notify(dispatchers.map((d) => Number(d.id)), `Incident reported: ${type.replace("_", " ")}`, description, "incident", undefined, tripId ?? undefined);
  }

  await logAudit({ user, action: "incident.create", entity: "incident", entityId: created.id, companyId });
  revalidatePath("/incidents");
  revalidatePath("/dispatch");
  return { ok: true, message: "Incident recorded and dispatch notified." };
}

async function updateIncidentAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("incident.manage");
  const id = num(fd, "id");
  const status = str(fd, "status");
  if (!id || !status) return { ok: false, message: "Missing incident or status." };
  await db
    .update(incidents)
    .set({
      status: status as "resolved",
      actionTaken: str(fd, "actionTaken") || null,
      resolvedAt: status === "resolved" ? new Date() : null,
    })
    .where(eq(incidents.id, id));
  await logAudit({ user, action: `incident.${status}`, entity: "incident", entityId: id });
  revalidatePath("/incidents");
  return { ok: true, message: `Incident marked ${status}.` };
}

/* --------------------------------------------------------- driver actions */

async function setAvailabilityAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!can(user.role as Role, "driver.duty")) return { ok: false, message: "Only drivers can change duty availability." };
  const status = str(fd, "status") as "available";
  const [driver] = await db.select().from(drivers).where(eq(drivers.userId, user.id)).limit(1);
  if (!driver) return { ok: false, message: "No driver record linked to this account." };
  await db.update(drivers).set({ status }).where(eq(drivers.id, driver.id));
  await logAudit({ user, action: "driver.availability", entity: "driver", entityId: driver.id, details: { status } });
  revalidatePath("/driver");
  return { ok: true, message: `You are now marked ${status.replace("_", " ")}.` };
}

async function confirmBoardingAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const bookingId = num(fd, "bookingId");
  const otp = str(fd, "otp");
  if (!bookingId) return { ok: false, message: "Missing booking." };
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking) return { ok: false, message: "Booking not found." };
  if (!booking.tripId) return { ok: false, message: "This booking is not attached to a trip." };
  const [trip] = await db.select().from(trips).where(eq(trips.id, booking.tripId)).limit(1);
  if (!trip) return { ok: false, message: "Trip not found." };
  if (user.role === "driver") {
    const [driver] = await db.select().from(drivers).where(eq(drivers.userId, user.id)).limit(1);
    if (!driver || trip.driverId !== driver.id) return { ok: false, message: "This trip is not assigned to you." };
  } else if (!can(user.role as Role, "trip.dispatch")) {
    return { ok: false, message: "Not permitted." };
  }

  if (booking.otpCode && otp && booking.otpCode !== otp) {
    await logAudit({ user, action: "boarding.otp_failed", entity: "booking", entityId: bookingId, details: { tripId: trip.id } });
    return { ok: false, message: "Incorrect boarding code. Ask the passenger for the 6-digit code in their app." };
  }
  if (!booking.otpCode && !otp) {
    return { ok: false, message: "Boarding code required." };
  }

  await db.insert(boardings).values({
    bookingId,
    tripId: trip.id,
    boardedAt: new Date(),
    otpVerified: true,
    recordedById: user.id,
  });
  await db.update(bookings).set({ status: "in_progress" }).where(eq(bookings.id, bookingId));
  await logAudit({ user, action: "boarding.confirm", entity: "booking", entityId: bookingId, companyId: booking.companyId, details: { otpVerified: true } });
  revalidatePath(`/driver/trip/${trip.id}`);
  return { ok: true, message: "Boarding confirmed." };
}

async function markNoShowAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const bookingId = num(fd, "bookingId");
  if (!bookingId) return { ok: false, message: "Missing booking." };
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking?.tripId) return { ok: false, message: "Booking is not attached to a trip." };
  await db.insert(boardings).values({
    bookingId,
    tripId: booking.tripId,
    noShow: true,
    note: str(fd, "note") || "Passenger not present",
    recordedById: user.id,
  });
  await db.update(bookings).set({ status: "no_show" }).where(eq(bookings.id, bookingId));
  await db.update(trips).set({ bookedSeats: sql`greatest(0, ${trips.bookedSeats} - 1)` }).where(eq(trips.id, booking.tripId));
  await logAudit({ user, action: "boarding.no_show", entity: "booking", entityId: bookingId, companyId: booking.companyId });
  revalidatePath(`/driver/trip/${booking.tripId}`);
  return { ok: true, message: "No-show recorded." };
}

async function driverTripAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!can(user.role as Role, "driver.duty")) return { ok: false, message: "Only drivers can operate trips." };
  const tripId = num(fd, "tripId");
  const op = str(fd, "op");
  if (!tripId || !op) return { ok: false, message: "Missing trip or operation." };
  const [driver] = await db.select().from(drivers).where(eq(drivers.userId, user.id)).limit(1);
  if (!driver) return { ok: false, message: "No driver record linked to this account." };
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) return { ok: false, message: "Trip not found." };
  if (trip.driverId !== driver.id) return { ok: false, message: "This trip is not assigned to you." };

  if (op === "start") {
    if (!canTransition(trip.status, "in_progress")) return { ok: false, message: `Trip cannot start from status ${trip.status}.` };
    await db.update(trips).set({ status: "in_progress", actualDeparture: new Date() }).where(eq(trips.id, tripId));
    if (trip.vehicleId) await db.update(vehicles).set({ status: "on_trip" }).where(eq(vehicles.id, trip.vehicleId));
    await db.update(drivers).set({ status: "on_trip" }).where(eq(drivers.id, driver.id));
    await db.update(bookings).set({ status: "in_progress" }).where(and(eq(bookings.tripId, tripId), inArray(bookings.status, ["assigned", "approved"])));
    await logAudit({ user, action: "trip.start", entity: "trip", entityId: tripId, companyId: trip.companyId });
    revalidatePath(`/driver/trip/${tripId}`);
    return { ok: true, message: "Journey started. Drive safely." };
  }

  if (op === "complete") {
    if (!canTransition(trip.status, "completed")) return { ok: false, message: `Trip cannot complete from status ${trip.status}.` };
    const now = new Date();
    await db.update(trips).set({ status: "completed", actualArrival: now }).where(eq(trips.id, tripId));
    if (trip.vehicleId) await db.update(vehicles).set({ status: "available" }).where(eq(vehicles.id, trip.vehicleId));
    await db.update(drivers).set({ status: "available" }).where(eq(drivers.id, driver.id));
    const overtime = trip.scheduledArrival
      ? Math.max(0, Math.round((now.getTime() - new Date(trip.scheduledArrival).getTime()) / 60000))
      : 0;
    const pay = computeDriverPay({ basePay: 85, allowance: Number(driver.tripAllowance), overtimeMinutes: overtime, overtimeRatePerHour: 30 });
    await db.insert(driverEarnings).values({
      driverId: driver.id,
      tripId,
      periodStart: trip.tripDate,
      periodEnd: trip.tripDate,
      basePay: "85.00",
      overtimePay: String(pay.overtimePay),
      allowance: String(Number(driver.tripAllowance)),
      total: String(pay.total),
      status: "accrued",
    });
    await db
      .update(bookings)
      .set({ status: "completed" })
      .where(and(eq(bookings.tripId, tripId), inArray(bookings.status, ["assigned", "approved", "in_progress"])));
    await logAudit({ user, action: "trip.complete", entity: "trip", entityId: tripId, companyId: trip.companyId, details: { pay: pay.total } });
    revalidatePath(`/driver/trip/${tripId}`);
    revalidatePath("/driver");
    return { ok: true, message: `Trip completed. Earnings accrued: GHS ${pay.total.toFixed(2)}.` };
  }

  if (op === "delay") {
    await db.update(trips).set({ status: "delayed" }).where(eq(trips.id, tripId));
    const passengers = await db
      .select({ userId: employees.userId })
      .from(bookings)
      .innerJoin(employees, eq(employees.id, bookings.employeeId))
      .where(eq(bookings.tripId, tripId));
    await notify(passengers.map((p) => p.userId).filter((v): v is number => Boolean(v)), "Your trip is running late", `Trip ${trip.reference} is delayed.`, "trip", undefined, tripId);
    await logAudit({ user, action: "trip.delay", entity: "trip", entityId: tripId });
    revalidatePath(`/driver/trip/${tripId}`);
    return { ok: true, message: "Delay recorded and passengers notified." };
  }

  return { ok: false, message: "Unknown operation." };
}

async function reportIncidentFromAppAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  return createIncidentAction(_p, fd);
}

async function markNotificationsReadAction__impl(_p: ActionState, _fd: FormData): Promise<ActionState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Session expired." };
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, user.id), sql`${notifications.readAt} is null`));
  revalidatePath("/settings");
  return { ok: true, message: "All notifications marked as read." };
}

/* ---------------------------------------------------------- wrappers */

export async function createTripAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(createTripAction__impl)(_p, fd);
}

export async function assignResourcesAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(assignResourcesAction__impl)(_p, fd);
}

export async function updateTripStatusAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(updateTripStatusAction__impl)(_p, fd);
}

export async function recordPositionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(recordPositionAction__impl)(_p, fd);
}

export async function planTripsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(planTripsAction__impl)(_p, fd);
}

export async function decideBookingAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(decideBookingAction__impl)(_p, fd);
}

export async function moveBookingAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(moveBookingAction__impl)(_p, fd);
}

export async function createIncidentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(createIncidentAction__impl)(_p, fd);
}

export async function updateIncidentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(updateIncidentAction__impl)(_p, fd);
}

export async function setAvailabilityAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(setAvailabilityAction__impl)(_p, fd);
}

export async function confirmBoardingAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(confirmBoardingAction__impl)(_p, fd);
}

export async function markNoShowAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(markNoShowAction__impl)(_p, fd);
}

export async function driverTripAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(driverTripAction__impl)(_p, fd);
}

export async function reportIncidentFromAppAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(reportIncidentFromAppAction__impl)(_p, fd);
}

export async function markNotificationsReadAction(_p: ActionState, _fd: FormData): Promise<ActionState> {
  return withAction(markNotificationsReadAction__impl)(_p, _fd);
}
