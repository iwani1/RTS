import { NextResponse } from "next/server";
import { and, between, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, companies, driverEarnings, drivers, employees, trips, vehicles } from "@/db/schema";
import { companyScope, getSessionUser } from "@/lib/auth";
import { canAccess, type Role } from "@/lib/rbac";
import { toCsv } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** CSV export for operating reports, trips, bookings and driver payroll. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!canAccess(user.role as Role, "reports") && !canAccess(user.role as Role, "finance")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "operating";
  const from = url.searchParams.get("from") ?? "1970-01-01";
  const to = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
  const companyParam = url.searchParams.get("company");

  // Tenant scope comes from the shared helper rather than a second, hand-rolled
  // copy of the rules. A corporate administrator is pinned to their own
  // company; platform staff may narrow the export to one company.
  const requested = companyParam ? Number(companyParam) : null;
  const scope =
    companyScope(user) ?? (Number.isFinite(requested) && requested ? requested : null);
  const companyFilter = scope ? eq(trips.companyId, scope) : undefined;

  let rows: Array<Record<string, unknown>> = [];
  let filename = "report.csv";

  if (type === "payroll") {
    if (!canAccess(user.role as Role, "finance")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const data = await db
      .select({
        driver: drivers.fullName,
        licenseNo: drivers.licenseNo,
        periodStart: driverEarnings.periodStart,
        periodEnd: driverEarnings.periodEnd,
        basePay: driverEarnings.basePay,
        overtimePay: driverEarnings.overtimePay,
        allowance: driverEarnings.allowance,
        deduction: driverEarnings.deduction,
        total: driverEarnings.total,
        status: driverEarnings.status,
        tripRef: trips.reference,
      })
      .from(driverEarnings)
      .innerJoin(drivers, eq(drivers.id, driverEarnings.driverId))
      .leftJoin(trips, eq(trips.id, driverEarnings.tripId))
      .orderBy(drivers.fullName, desc(driverEarnings.periodStart))
      .limit(5000);
    rows = data;
    filename = "driver-payroll.csv";
  } else if (type === "trips") {
    const data = await db
      .select({
        reference: trips.reference,
        date: trips.tripDate,
        direction: trips.direction,
        company: companies.name,
        vehicle: vehicles.registrationNo,
        driver: drivers.fullName,
        status: trips.status,
        capacity: trips.capacity,
        bookedSeats: trips.bookedSeats,
        plannedKm: trips.plannedKm,
        scheduledDeparture: trips.scheduledDeparture,
        actualDeparture: trips.actualDeparture,
        scheduledArrival: trips.scheduledArrival,
        actualArrival: trips.actualArrival,
      })
      .from(trips)
      .innerJoin(companies, eq(companies.id, trips.companyId))
      .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
      .leftJoin(drivers, eq(drivers.id, trips.driverId))
      .where(and(between(trips.tripDate, from, to), companyFilter))
      .orderBy(desc(trips.tripDate))
      .limit(5000);
    rows = data;
    filename = "trips.csv";
  } else if (type === "bookings") {
    const data = await db
      .select({
        reference: bookings.reference,
        date: bookings.bookingDate,
        employee: employees.fullName,
        employeeCode: employees.employeeCode,
        company: companies.name,
        direction: bookings.direction,
        status: bookings.status,
        pickupTime: bookings.pickupTime,
        trip: trips.reference,
        seats: bookings.seats,
        cancelReason: bookings.cancelReason,
      })
      .from(bookings)
      .innerJoin(employees, eq(employees.id, bookings.employeeId))
      .innerJoin(companies, eq(companies.id, bookings.companyId))
      .leftJoin(trips, eq(trips.id, bookings.tripId))
      .where(and(between(bookings.bookingDate, from, to), scope ? eq(bookings.companyId, scope) : undefined))
      .orderBy(desc(bookings.bookingDate))
      .limit(5000);
    rows = data;
    filename = "bookings.csv";
  } else {
    const data = await db
      .select({
        date: trips.tripDate,
        company: companies.name,
        trips: trips.reference,
        status: trips.status,
        passengers: trips.bookedSeats,
        capacity: trips.capacity,
        plannedKm: trips.plannedKm,
      })
      .from(trips)
      .innerJoin(companies, eq(companies.id, trips.companyId))
      .where(and(between(trips.tripDate, from, to), companyFilter))
      .orderBy(trips.tripDate, companies.name)
      .limit(5000);
    const grouped = new Map<string, Record<string, unknown>>();
    for (const r of data) {
      const key = `${r.date}|${r.company}`;
      const current = grouped.get(key) ?? {
        date: r.date,
        company: r.company,
        trips: 0,
        completed: 0,
        passengers: 0,
        capacity: 0,
        plannedKm: 0,
      };
      current.trips = Number(current.trips) + 1;
      current.completed = Number(current.completed) + (r.status === "completed" ? 1 : 0);
      current.passengers = Number(current.passengers) + Number(r.passengers);
      current.capacity = Number(current.capacity) + Number(r.capacity);
      current.plannedKm = Number(current.plannedKm) + Number(r.plannedKm);
      grouped.set(key, current);
    }
    rows = [...grouped.values()].map((r) => ({
      ...r,
      seatFillPct: Number(r.capacity) ? Math.round((Number(r.passengers) / Number(r.capacity)) * 100) : 0,
    }));
    filename = "operating-report.csv";
  }

  if (!rows.length) rows = [{ message: "No data for the selected filters" }];
  const csv = toCsv(rows);

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
