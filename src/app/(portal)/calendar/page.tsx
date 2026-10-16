import Link from "next/link";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, driverShifts, drivers, shifts, trips, vehicles } from "@/db/schema";
import {
  EmptyState,
  MetricStrip,
  MetricCell,
  PageHeader,
  Panel,
  StatusChip,
} from "@/components/ui";
import { ButtonLink } from "@/components/ui/button";
import { companyScope, requireSection } from "@/lib/auth";
import { cn, humanize, n, timeOnly } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * The scheduling calendar.
 *
 * A month grid of every trip on the board, with the shift roster underneath.
 * It answers the question a dispatcher actually asks on a Sunday evening:
 * "what does the week look like, and where is it thin?"
 */

type MonthCell = {
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  trips: Array<{
    id: number;
    reference: string;
    status: string;
    departure: string;
    company: string | null;
    vehicle: string | null;
    booked: number;
    capacity: number;
  }>;
  shifts: number;
};

function monthBounds(month: string): { start: string; end: string } {
  const [year, monthIndex] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthIndex - 1, 1));
  const end = new Date(Date.UTC(year, monthIndex, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function addMonths(month: string, delta: number): string {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthIndex - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; company?: string }>;
}) {
  const user = await requireSection("calendar");
  const scope = companyScope(user);
  const params = await searchParams;
  const now = new Date();
  const month = params.month ?? now.toISOString().slice(0, 7);
  const company = params.company ?? "";

  const { start, end } = monthBounds(month);
  // Pad to whole weeks so the grid always has seven columns.
  const gridStart = new Date(`${start}T00:00:00Z`);
  gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());
  const gridEnd = new Date(`${end}T00:00:00Z`);
  gridEnd.setUTCDate(gridEnd.getUTCDate() + (6 - gridEnd.getUTCDay()));
  const gridStartISO = gridStart.toISOString().slice(0, 10);
  const gridEndISO = gridEnd.toISOString().slice(0, 10);

  const filters = [
    gte(trips.tripDate, gridStartISO),
    lte(trips.tripDate, gridEndISO),
    scope ? eq(trips.companyId, scope) : undefined,
    company && !scope ? eq(trips.companyId, Number(company)) : undefined,
  ].filter(Boolean);

  const tripRows = await db
    .select({
      id: trips.id,
      reference: trips.reference,
      status: trips.status,
      tripDate: trips.tripDate,
      departure: trips.scheduledDeparture,
      booked: trips.bookedSeats,
      capacity: trips.capacity,
      company: companies.name,
      vehicle: vehicles.registrationNo,
    })
    .from(trips)
    .leftJoin(companies, eq(companies.id, trips.companyId))
    .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
    .where(and(...filters))
    .orderBy(asc(trips.scheduledDeparture));

  // Driver rosters are the dated shifts: a driver on duty for a given day.
  const shiftRows = await db
    .select({ date: driverShifts.shiftDate, people: sql<number>`count(*)` })
    .from(driverShifts)
    .innerJoin(drivers, eq(drivers.id, driverShifts.driverId))
    .where(
      and(
        gte(driverShifts.shiftDate, gridStartISO),
        lte(driverShifts.shiftDate, gridEndISO),
      ),
    )
    .groupBy(driverShifts.shiftDate);

  const companyOptions = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .orderBy(asc(companies.name));

  const byDate = new Map<string, MonthCell["trips"]>();
  for (const trip of tripRows) {
    const date = String(trip.tripDate).slice(0, 10);
    const list = byDate.get(date) ?? [];
    list.push({
      id: trip.id,
      reference: trip.reference,
      status: trip.status,
      departure: trip.departure ? new Date(trip.departure).toISOString() : "",
      company: trip.company,
      vehicle: trip.vehicle,
      booked: n(trip.booked),
      capacity: n(trip.capacity),
    });
    byDate.set(date, list);
  }
  const shiftByDate = new Map(
    shiftRows.map((row) => [String(row.date).slice(0, 10), n(row.people)]),
  );

  const todayISO = now.toISOString().slice(0, 10);
  const cells: MonthCell[] = [];
  for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = cursor.toISOString().slice(0, 10);
    cells.push({
      date,
      day: cursor.getUTCDate(),
      inMonth: cursor.toISOString().slice(0, 7) === month,
      isToday: date === todayISO,
      trips: byDate.get(date) ?? [],
      shifts: shiftByDate.get(date) ?? 0,
    });
  }

  const monthTrips = tripRows.filter((t) => String(t.tripDate).slice(0, 7) === month);
  const unassigned = monthTrips.filter((t) => !t.vehicle).length;
  const seats = monthTrips.reduce((sum, t) => sum + n(t.booked), 0);
  const capacity = monthTrips.reduce((sum, t) => sum + n(t.capacity), 0);
  const busiest = [...byDate.entries()].sort((a, b) => b[1].length - a[1].length)[0];

  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div>
      <PageHeader
        eyebrow="Plan"
        title="Schedule"
        subtitle="Every trip on the board for the month, with the shift roster underneath."
        actions={
          <div className="flex items-center gap-2">
            <ButtonLink
              href={`/calendar?month=${addMonths(month, -1)}`}
              variant="outline"
              size="sm"
            >
              Previous month
            </ButtonLink>
            <ButtonLink href={`/calendar?month=${todayISO.slice(0, 7)}`} variant="outline" size="sm">
              This month
            </ButtonLink>
            <ButtonLink
              href={`/calendar?month=${addMonths(month, 1)}`}
              variant="outline"
              size="sm"
            >
              Next month
            </ButtonLink>
          </div>
        }
      />

      <MetricStrip className="mt-4">
        <MetricCell label="Trips" value={String(monthTrips.length)} />
        <MetricCell label="Passengers booked" value={String(seats)} />
        <MetricCell
          label="Seat utilisation"
          value={capacity ? `${Math.round((seats / capacity) * 100)}%` : "—"}
        />
        <MetricCell label="Without a vehicle" value={String(unassigned)} />
        <MetricCell
          label="Busiest day"
          value={busiest ? busiest[0] : "—"}
          hint={busiest ? `${busiest[1].length} trips` : undefined}
        />
      </MetricStrip>

      <Panel
        className="mt-4"
        title={monthLabel}
        eyebrow="Month"
        padded={false}
        actions={
          companyOptions.length && !scope ? (
            <form method="get" className="flex items-center gap-2">
              <input type="hidden" name="month" value={month} />
              <select
                name="company"
                defaultValue={company}
                className="h-7 rounded-[8px] border border-line-strong bg-surface-1 px-2 text-[12px] text-ink"
              >
                <option value="">All clients</option>
                {companyOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="h-7 rounded-full border border-line-strong px-3 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                Apply
              </button>
            </form>
          ) : null
        }
      >
        <div className="grid grid-cols-7 border-b border-line">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
            <div
              key={label}
              className="px-2 py-2 text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-3"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((cell) => (
            <div
              key={cell.date}
              className={cn(
                "min-h-[112px] border-b border-r border-line p-1.5 last:border-r-0",
                !cell.inMonth && "bg-surface-1/40",
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "numeric inline-flex h-5 min-w-5 items-center justify-center rounded-full text-[11.5px]",
                    cell.isToday
                      ? "bg-signal text-signal-ink"
                      : cell.inMonth
                        ? "text-ink-2"
                        : "text-ink-3",
                  )}
                >
                  {cell.day}
                </span>
                {cell.shifts ? (
                  <span className="numeric text-[10px] text-ink-3" title="Staff on shift">
                    {cell.shifts} on shift
                  </span>
                ) : null}
              </div>

              <div className="mt-1 space-y-1">
                {cell.trips.slice(0, 3).map((trip) => (
                  <Link
                    key={trip.id}
                    href={`/trips/${trip.id}`}
                    className="block rounded-[6px] border border-line bg-surface-1 px-1.5 py-1 transition-colors hover:border-ink-3"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="numeric text-[10.5px] text-ink">
                        {timeOnly(trip.departure)}
                      </span>
                      <StatusChip status={trip.status} />
                    </div>
                    <div className="mt-0.5 truncate text-[10.5px] text-ink-3">
                      {trip.vehicle ?? "No vehicle"}
                    </div>
                  </Link>
                ))}
                {cell.trips.length > 3 ? (
                  <p className="numeric px-1 text-[10.5px] text-ink-3">
                    +{cell.trips.length - 3} more
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel eyebrow="Load" title="Busiest days">
          {monthTrips.length === 0 ? (
            <EmptyState
              title="No trips scheduled"
              hint="Nothing is on the board for this month yet."
            />
          ) : (
            <ul className="space-y-2">
              {[...byDate.entries()]
                .sort((a, b) => b[1].length - a[1].length)
                .slice(0, 6)
                .map(([date, list]) => {
                  const seatsBooked = list.reduce((sum, t) => sum + t.booked, 0);
                  const seatsTotal = list.reduce((sum, t) => sum + t.capacity, 0);
                  const percent = seatsTotal ? Math.min(100, (seatsBooked / seatsTotal) * 100) : 0;
                  return (
                    <li key={date}>
                      <div className="flex items-center justify-between text-[12.5px]">
                        <span className="text-ink">{date}</span>
                        <span className="numeric text-ink-3">
                          {list.length} trips · {seatsBooked}/{seatsTotal} seats
                        </span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-signal"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
            </ul>
          )}
        </Panel>

        <Panel eyebrow="Coverage" title="Trips by status">
          <ul className="space-y-2">
            {["scheduled", "dispatching", "in_progress", "delayed", "completed", "cancelled"].map(
              (status) => {
                const count = monthTrips.filter((t) => t.status === status).length;
                const percent = monthTrips.length
                  ? Math.round((count / monthTrips.length) * 100)
                  : 0;
                return (
                  <li key={status} className="flex items-center justify-between text-[12.5px]">
                    <span className="flex items-center gap-2 text-ink">
                      <StatusChip status={status} />
                      {humanize(status)}
                    </span>
                    <span className="numeric text-ink-3">
                      {count} · {percent}%
                    </span>
                  </li>
                );
              },
            )}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
