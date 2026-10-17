import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  boardings,
  bookings,
  companies,
  drivers,
  employees,
  incidents,
  routes,
  trips,
  vehicles,
} from "@/db/schema";
import { CommandCentre } from "@/components/dispatch/command-centre";
import type {
  DispatchAlert,
  DispatchEvent,
  DispatchTrip,
} from "@/components/dispatch/command-centre";
import { companyScope, requireSection } from "@/lib/auth";
import { getLatestPositions } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { dateOnly, humanize, timeOnly } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DispatchPage() {
  const user = await requireSection("dispatch");
  const scope = companyScope(user);

  const board = await db
    .select({
      trip: trips,
      company: companies.name,
      vehicle: vehicles.registrationNo,
      vehicleCapacity: vehicles.capacity,
      driver: drivers.fullName,
      driverPhone: drivers.phone,
      route: routes.name,
    })
    .from(trips)
    .innerJoin(companies, eq(companies.id, trips.companyId))
    .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
    .leftJoin(drivers, eq(drivers.id, trips.driverId))
    .leftJoin(routes, eq(routes.id, trips.routeId))
    .where(
      and(
        scope ? eq(trips.companyId, scope) : undefined,
        inArray(trips.status, [
          "scheduled",
          "dispatching",
          "in_progress",
          "delayed",
          "breakdown",
        ]),
      ),
    )
    .orderBy(asc(trips.scheduledDeparture))
    .limit(60);

  const tripIds = board.map((row) => row.trip.id);

  const [positions, manifest, alertRows, vehicleRows, driverRows, eventRows] =
    await Promise.all([
      tripIds.length
        ? getLatestPositions(tripIds)
        : Promise.resolve([]),
      tripIds.length
        ? db
            .select({
              tripId: boardings.tripId,
              bookingId: boardings.bookingId,
              bookingStatus: bookings.status,
              reference: bookings.reference,
              name: employees.fullName,
              pickupAddress: bookings.pickupAddress,
            })
            .from(boardings)
            .innerJoin(bookings, eq(bookings.id, boardings.bookingId))
            .innerJoin(employees, eq(employees.id, bookings.employeeId))
            .where(inArray(boardings.tripId, tripIds))
        : Promise.resolve([]),
      db
        .select({
          incident: incidents,
          company: companies.name,
          vehicle: vehicles.registrationNo,
        })
        .from(incidents)
        .leftJoin(companies, eq(companies.id, incidents.companyId))
        .leftJoin(vehicles, eq(vehicles.id, incidents.vehicleId))
        .where(inArray(incidents.status, ["open", "acknowledged"]))
        .orderBy(desc(incidents.reportedAt))
        .limit(12),
      db
        .select({
          id: vehicles.id,
          registrationNo: vehicles.registrationNo,
          capacity: vehicles.capacity,
          status: vehicles.status,
        })
        .from(vehicles)
        .orderBy(asc(vehicles.registrationNo)),
      db
        .select({ id: drivers.id, fullName: drivers.fullName, status: drivers.status })
        .from(drivers)
        .orderBy(asc(drivers.fullName)),
      tripIds.length
        ? db
            .select({
              tripId: trips.id,
              reference: trips.reference,
              status: trips.status,
              actualDeparture: trips.actualDeparture,
              actualArrival: trips.actualArrival,
              scheduledDeparture: trips.scheduledDeparture,
              updatedAt: trips.createdAt,
            })
            .from(trips)
            .where(inArray(trips.id, tripIds))
            .orderBy(desc(trips.scheduledDeparture))
            .limit(24)
        : Promise.resolve([]),
    ]);

  const positionByTrip = new Map(positions.map((p) => [p.tripId, p]));

  const dispatchTrips: DispatchTrip[] = board.map((row) => {
    const pos = positionByTrip.get(row.trip.id);
    const actual = row.trip.actualDeparture
      ? new Date(row.trip.actualDeparture).getTime()
      : null;
    const scheduled = new Date(row.trip.scheduledDeparture).getTime();
    const deviation = actual == null ? null : Math.round((actual - scheduled) / 60000);

    const passengers = manifest
      .filter((m) => m.tripId === row.trip.id)
      .map((m) => ({
        bookingId: m.bookingId,
        reference: m.reference,
        name: m.name,
        status: m.bookingStatus,
        pickup: m.pickupAddress,
      }));

    return {
      id: row.trip.id,
      reference: row.trip.reference,
      company: row.company,
      direction: row.trip.direction,
      status: row.trip.status,
      etd: timeOnly(row.trip.scheduledDeparture),
      eta: row.trip.scheduledArrival
        ? timeOnly(row.trip.scheduledArrival)
        : "—",
      deviation,
      vehicle: row.vehicle,
      vehicleCapacity: row.vehicleCapacity,
      driver: row.driver,
      driverPhone: row.driverPhone,
      bookedSeats: row.trip.bookedSeats,
      capacity: row.trip.capacity || row.vehicleCapacity || 0,
      currentOccupancy: row.trip.currentOccupancy,
      lat: pos?.lat ?? null,
      lng: pos?.lng ?? null,
      speedKph: pos?.speedKph ?? null,
      heading: pos?.heading ?? null,
      lastSeenAt: pos?.recordedAt ? new Date(pos.recordedAt).toISOString() : null,
      waitingMinutes: row.trip.waitingMinutes,
      overtimeMinutes: row.trip.overtimeMinutes,
      route: row.route,
      passengers,
    };
  });

  const alerts: DispatchAlert[] = alertRows.map((row) => ({
    id: row.incident.id,
    type: row.incident.type,
    severity: row.incident.severity,
    status: row.incident.status,
    description: row.incident.description,
    company: row.company,
    vehicle: row.vehicle,
    reportedAt: row.incident.reportedAt.toISOString(),
  }));

  const events: DispatchEvent[] = eventRows.map((row) => ({
    at: new Date(row.updatedAt).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    trip: row.reference,
    text:
      row.status === "in_progress"
        ? "departed the origin"
        : row.status === "completed"
          ? "completed the journey"
          : row.status === "delayed"
            ? "running behind schedule"
            : row.status === "breakdown"
              ? "vehicle reported a breakdown"
              : `status set to ${humanize(row.status).toLowerCase()}`,
    tone:
      row.status === "breakdown"
        ? "critical"
        : row.status === "delayed"
          ? "caution"
          : row.status === "in_progress"
            ? "live"
            : "idle",
  }));

  const vehicleOptions = vehicleRows
    .filter((v) => !["under_maintenance", "out_of_service"].includes(v.status))
    .map((v) => ({
      id: v.id,
      label: `${v.registrationNo} · ${v.capacity} seats · ${humanize(v.status).toLowerCase()}`,
    }));

  const driverOptions = driverRows
    .filter((d) => d.status !== "unavailable")
    .map((d) => ({
      id: d.id,
      label: `${d.fullName} · ${humanize(d.status).toLowerCase()}`,
    }));

  const unassigned = dispatchTrips.filter(
    (t) => !t.vehicle || !t.driver,
  ).length;
  const inMotion = dispatchTrips.filter(
    (t) => t.status === "in_progress",
  ).length;
  const troubled = dispatchTrips.filter(
    (t) => t.status === "delayed" || t.status === "breakdown",
  ).length;
  const passengers = dispatchTrips.reduce((sum, t) => sum + t.bookedSeats, 0);

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Command centre</p>
          <h1 className="mt-1 font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">
            Live dispatch
          </h1>
        </div>
        <dl className="flex items-center gap-5">
          <Stat label="On the road" value={inMotion} tone="live" />
          <Stat label="Unassigned" value={unassigned} tone={unassigned ? "caution" : "idle"} />
          <Stat label="Troubled" value={troubled} tone={troubled ? "critical" : "idle"} />
          <Stat label="Passengers" value={passengers} />
        </dl>
      </header>

      <CommandCentre
        trips={dispatchTrips}
        alerts={alerts}
        events={events}
        vehicles={vehicleOptions}
        drivers={driverOptions}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "idle",
}: {
  label: string;
  value: number;
  tone?: "live" | "ok" | "caution" | "critical" | "idle";
}) {
  const color =
    tone === "live"
      ? "text-st-live"
      : tone === "ok"
        ? "text-st-ok"
        : tone === "caution"
          ? "text-st-caution"
          : tone === "critical"
            ? "text-st-critical"
            : "text-ink";
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className={cn("numeric mt-0.5 text-[18px] font-medium", color)}>{value}</dd>
    </div>
  );
}
