import { and, asc, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  companies,
  employees,
  gpsEvents,
  incidents,
  invoices,
  maintenanceRecords,
  trips,
  vehicles,
  drivers,
} from "@/db/schema";
import { n } from "./utils";

export type Kpis = {
  companies: number;
  employees: number;
  bookings: number;
  completedTrips: number;
  cancelledBookings: number;
  activeVehicles: number;
  totalVehicles: number;
  fleetUtilisation: number;
  onTimePct: number;
  avgDelayMinutes: number;
  openIncidents: number;
  revenue: number;
  outstanding: number;
  costPerPassenger: number;
  tripsToday: number;
};

export async function getKpis(companyId: number | null): Promise<Kpis> {
  const companyFilter = companyId ? eq(trips.companyId, companyId) : undefined;

  const [companyCount] = await db.select({ v: count() }).from(companies);
  const [employeeCount] = await db
    .select({ v: count() })
    .from(employees)
    .where(companyId ? eq(employees.companyId, companyId) : undefined);
  const [bookingCount] = await db
    .select({ v: count() })
    .from(bookings)
    .where(companyId ? eq(bookings.companyId, companyId) : undefined);
  const [cancelledCount] = await db
    .select({ v: count() })
    .from(bookings)
    .where(
      companyId
        ? and(eq(bookings.companyId, companyId), eq(bookings.status, "cancelled"))
        : eq(bookings.status, "cancelled"),
    );

  const tripAgg = await db
    .select({
      total: count(),
      completed: sql<number>`sum(case when ${trips.status} = 'completed' then 1 else 0 end)`,
      onTime: sql<number>`sum(case when ${trips.actualArrival} is not null and ${trips.actualArrival} <= ${trips.scheduledArrival} + interval '10 minutes' then 1 else 0 end)`,
      withArrival: sql<number>`sum(case when ${trips.actualArrival} is not null then 1 else 0 end)`,
      avgDelay: sql<number>`coalesce(avg(case when ${trips.status} = 'completed' then greatest(0, extract(epoch from (${trips.actualArrival} - ${trips.scheduledArrival}))/60) end), 0)`,
      passengers: sql<number>`coalesce(sum(${trips.bookedSeats}), 0)`,
      km: sql<number>`coalesce(sum(${trips.plannedKm}), 0)`,
    })
    .from(trips)
    .where(companyFilter);

  const [vehicleAgg] = await db
    .select({
      total: count(),
      active: sql<number>`sum(case when ${vehicles.status} in ('assigned','on_trip') then 1 else 0 end)`,
      available: sql<number>`sum(case when ${vehicles.status} = 'available' then 1 else 0 end)`,
    })
    .from(vehicles);

  const [incidentAgg] = await db
    .select({ open: sql<number>`sum(case when ${incidents.status} <> 'resolved' then 1 else 0 end)`, total: count() })
    .from(incidents)
    .where(companyId ? eq(incidents.companyId, companyId) : undefined);

  const [revenueAgg] = await db
    .select({
      total: sql<number>`coalesce(sum(${invoices.total}), 0)`,
      paid: sql<number>`coalesce(sum(${invoices.amountPaid}), 0)`,
    })
    .from(invoices)
    .where(companyId ? eq(invoices.companyId, companyId) : undefined);

  const [todayTrips] = await db
    .select({ v: count() })
    .from(trips)
    .where(and(eq(trips.tripDate, new Date().toISOString().slice(0, 10)), companyFilter ?? sql`true`));

  const [maintenanceCost] = await db
    .select({ total: sql<number>`coalesce(sum(${maintenanceRecords.cost}), 0)` })
    .from(maintenanceRecords);

  const t = tripAgg[0] ?? { total: 0, completed: 0, onTime: 0, withArrival: 0, avgDelay: 0, passengers: 0, km: 0 };
  const completed = Number(t.completed ?? 0);
  const onTime = Number(t.onTime ?? 0);
  const withArrival = Number(t.withArrival ?? 0);
  const passengers = Number(t.passengers ?? 0);
  const revenue = n(revenueAgg?.total);
  const paid = n(revenueAgg?.paid);
  const totalVehicles = Number(vehicleAgg?.total ?? 0);
  const activeVehicles = Number(vehicleAgg?.active ?? 0);

  const costPerPassenger = passengers > 0 ? (n(maintenanceCost?.total) + 0) / passengers : 0;

  return {
    companies: Number(companyCount?.v ?? 0),
    employees: Number(employeeCount?.v ?? 0),
    bookings: Number(bookingCount?.v ?? 0),
    completedTrips: completed,
    cancelledBookings: Number(cancelledCount?.v ?? 0),
    totalVehicles,
    activeVehicles,
    fleetUtilisation: totalVehicles ? (activeVehicles / totalVehicles) * 100 : 0,
    onTimePct: withArrival ? (onTime / withArrival) * 100 : 0,
    avgDelayMinutes: Math.round(Number(t.avgDelay ?? 0) * 10) / 10,
    openIncidents: Number(incidentAgg?.open ?? 0),
    revenue,
    outstanding: Math.max(0, revenue - paid),
    costPerPassenger,
    tripsToday: Number(todayTrips?.v ?? 0),
  };
}

export async function getTripsPerDay(companyId: number | null, days = 14) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = await db
    .select({
      day: sql<string>`to_char(${trips.tripDate}, 'YYYY-MM-DD')`,
      total: count(),
      completed: sql<number>`sum(case when ${trips.status} = 'completed' then 1 else 0 end)`,
      passengers: sql<number>`coalesce(sum(${trips.bookedSeats}), 0)`,
    })
    .from(trips)
    .where(
      and(
        gte(trips.tripDate, since.toISOString().slice(0, 10)),
        companyId ? eq(trips.companyId, companyId) : sql`true`,
      ),
    )
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  return rows.map((r) => ({
    day: r.day,
    total: Number(r.total),
    completed: Number(r.completed ?? 0),
    passengers: Number(r.passengers ?? 0),
  }));
}

export async function getRevenueByCompany() {
  const rows = await db
    .select({
      companyId: invoices.companyId,
      company: companies.name,
      total: sql<number>`coalesce(sum(${invoices.total}), 0)`,
      paid: sql<number>`coalesce(sum(${invoices.amountPaid}), 0)`,
    })
    .from(invoices)
    .innerJoin(companies, eq(companies.id, invoices.companyId))
    .groupBy(invoices.companyId, companies.name)
    .orderBy(desc(sql`sum(${invoices.total})`));
  return rows.map((r) => ({ ...r, total: n(r.total), paid: n(r.paid) }));
}

export async function getDriverPerformance(limit = 8) {
  const rows = await db
    .select({
      driverId: trips.driverId,
      driver: drivers.fullName,
      tripsCompleted: sql<number>`sum(case when ${trips.status} = 'completed' then 1 else 0 end)`,
      onTime: sql<number>`sum(case when ${trips.status} = 'completed' and ${trips.actualArrival} <= ${trips.scheduledArrival} + interval '10 minutes' then 1 else 0 end)`,
      passengers: sql<number>`coalesce(sum(${trips.bookedSeats}), 0)`,
      rating: drivers.ratingAvg,
    })
    .from(trips)
    .innerJoin(drivers, eq(drivers.id, trips.driverId))
    .groupBy(trips.driverId, drivers.fullName, drivers.ratingAvg)
    .orderBy(desc(sql`sum(case when ${trips.status} = 'completed' then 1 else 0 end)`))
    .limit(limit);
  return rows.map((r) => ({
    ...r,
    tripsCompleted: Number(r.tripsCompleted ?? 0),
    onTime: Number(r.onTime ?? 0),
    passengers: Number(r.passengers ?? 0),
    rating: n(r.rating),
  }));
}

export async function getLiveTrips(companyId: number | null) {
  const rows = await db
    .select({
      trip: trips,
      vehicle: vehicles,
      driver: drivers,
      company: companies,
    })
    .from(trips)
    .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
    .leftJoin(drivers, eq(drivers.id, trips.driverId))
    .innerJoin(companies, eq(companies.id, trips.companyId))
    .where(
      and(
        inArray(trips.status, ["scheduled", "dispatching", "in_progress", "delayed", "breakdown"]),
        companyId ? eq(trips.companyId, companyId) : sql`true`,
      ),
    )
    .orderBy(asc(trips.scheduledDeparture))
    .limit(40);
  return rows;
}

export async function getLatestPositions(tripIds: number[]) {
  if (!tripIds.length)
    return [] as Array<{
      tripId: number;
      lat: number;
      lng: number;
      speedKph: number | null;
      heading: number | null;
      recordedAt: Date;
    }>;
  const rows = await db
    .select({
      tripId: gpsEvents.tripId,
      lat: gpsEvents.lat,
      lng: gpsEvents.lng,
      speedKph: gpsEvents.speedKph,
      heading: gpsEvents.heading,
      recordedAt: gpsEvents.recordedAt,
      rn: sql<number>`row_number() over (partition by ${gpsEvents.tripId} order by ${gpsEvents.recordedAt} desc)`,
    })
    .from(gpsEvents)
    .where(inArray(gpsEvents.tripId, tripIds));
  return rows
    .filter((r) => Number(r.rn) === 1)
    .map((r) => ({
      tripId: r.tripId as number,
      lat: r.lat,
      lng: r.lng,
      speedKph: r.speedKph,
      heading: r.heading,
      recordedAt: r.recordedAt,
    }));
}

export async function getRouteEfficiency(companyId: number | null) {
  const rows = await db
    .select({
      routeId: trips.routeId,
      company: companies.name,
      plannedKm: sql<number>`coalesce(avg(${trips.plannedKm}), 0)`,
      tripsCount: count(),
      passengers: sql<number>`coalesce(avg(${trips.bookedSeats}), 0)`,
    })
    .from(trips)
    .innerJoin(companies, eq(companies.id, trips.companyId))
    .where(companyId ? eq(trips.companyId, companyId) : sql`true`)
    .groupBy(trips.routeId, companies.name)
    .orderBy(desc(count()))
    .limit(10);
  return rows.map((r) => ({
    ...r,
    plannedKm: n(r.plannedKm),
    passengers: n(r.passengers),
    tripsCount: Number(r.tripsCount),
  }));
}

export async function getDocumentExpiries(withinDays = 45) {
  const limit = new Date();
  limit.setDate(limit.getDate() + withinDays);
  const limitIso = limit.toISOString().slice(0, 10);
  const vehicleDocs = await db
    .select({
      id: vehicles.id,
      label: vehicles.registrationNo,
      insurance: vehicles.insuranceExpiry,
      roadworthy: vehicles.roadworthinessExpiry,
      registration: vehicles.registrationExpiry,
      status: vehicles.status,
    })
    .from(vehicles)
    .where(
      sql`(${vehicles.insuranceExpiry} is not null and ${vehicles.insuranceExpiry} <= ${limitIso})
       or (${vehicles.roadworthinessExpiry} is not null and ${vehicles.roadworthinessExpiry} <= ${limitIso})
       or (${vehicles.registrationExpiry} is not null and ${vehicles.registrationExpiry} <= ${limitIso})`,
    )
    .orderBy(asc(vehicles.insuranceExpiry));
  const driverDocs = await db
    .select({
      id: drivers.id,
      label: drivers.fullName,
      license: drivers.licenseExpiry,
      status: drivers.status,
    })
    .from(drivers)
    .where(and(sql`${drivers.licenseExpiry} is not null`, lte(drivers.licenseExpiry, limitIso)))
    .orderBy(asc(drivers.licenseExpiry));
  return { vehicleDocs, driverDocs };
}

export async function getMaintenanceDue() {
  const rows = await db
    .select({
      id: vehicles.id,
      registrationNo: vehicles.registrationNo,
      model: vehicles.model,
      odometerKm: vehicles.odometerKm,
      lastService: sql<string | null>`(select max(service_date) from maintenance_records mr where mr.vehicle_id = ${vehicles.id})`,
    })
    .from(vehicles)
    .orderBy(desc(vehicles.odometerKm))
    .limit(12);
  return rows;
}
