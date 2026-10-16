import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bookings, companies, employees, incidents, trips, vehicles } from "@/db/schema";
import { BarChart, DonutStat, LineChart } from "@/components/charts";
import { LiveMap, type MapPoint } from "@/components/live-map";
import {
  EmptyState,
  MetricStrip,
  MetricCell,
  PageHeader,
  Panel,
  ProgressBar,
  StatusChip,
  TableWrap,
  TBody,
  TD,
  TDPrimary,
  THead,
  TH,
  TR,
} from "@/components/ui";
import { ButtonLink } from "@/components/ui/button";
import { requireSection, companyScope } from "@/lib/auth";
import {
  getDocumentExpiries,
  getDriverPerformance,
  getKpis,
  getLatestPositions,
  getLiveTrips,
  getRevenueByCompany,
  getTripsPerDay,
} from "@/lib/queries";
import { dateOnly, money, n, timeOnly } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireSection("dashboard");
  const scope = companyScope(user);

  const [kpis, perDay, revenue, driverPerf, live, expiries, upcoming, openIncidents, pending] =
    await Promise.all([
      getKpis(scope),
      getTripsPerDay(scope, 14),
      getRevenueByCompany(),
      getDriverPerformance(6),
      getLiveTrips(scope),
      getDocumentExpiries(),
      db
        .select({
          trip: trips,
          company: companies.name,
          vehicle: vehicles.registrationNo,
        })
        .from(trips)
        .innerJoin(companies, eq(companies.id, trips.companyId))
        .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
        .where(
          and(
            eq(trips.tripDate, new Date().toISOString().slice(0, 10)),
            scope ? eq(trips.companyId, scope) : undefined,
          ),
        )
        .orderBy(trips.scheduledDeparture)
        .limit(8),
      db
        .select({ incident: incidents, company: companies.name })
        .from(incidents)
        .leftJoin(companies, eq(companies.id, incidents.companyId))
        .where(inArray(incidents.status, ["open", "acknowledged"]))
        .orderBy(desc(incidents.reportedAt))
        .limit(5),
      db
        .select({ v: bookings.id })
        .from(bookings)
        .where(
          and(
            eq(bookings.status, "pending"),
            scope ? eq(bookings.companyId, scope) : undefined,
          ),
        )
        .limit(50),
    ]);

  const positions = await getLatestPositions(live.map((l) => l.trip.id));
  const points: MapPoint[] = [];
  for (const l of live) {
    const pos = positions.find((p) => p.tripId === l.trip.id);
    if (!pos) continue;
    points.push({
      id: `t${l.trip.id}`,
      lat: pos.lat,
      lng: pos.lng,
      label: l.vehicle?.registrationNo ?? "unassigned",
      kind: "vehicle",
      tone:
        l.trip.status === "in_progress"
          ? "teal"
          : l.trip.status === "delayed" || l.trip.status === "breakdown"
            ? "rose"
            : "navy",
    });
  }

  const seatsBooked = upcoming.reduce((sum, t) => sum + t.trip.bookedSeats, 0);
  const seatsTotal = upcoming.reduce((sum, t) => sum + t.trip.capacity, 0);

  return (
    <div>
      <PageHeader
        eyebrow={new Date().toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
        title="Operations dashboard"
        subtitle={
          scope
            ? "Your staff transportation programme at a glance."
            : "Every corporate client, every vehicle, every journey."
        }
        actions={
          <>
            <ButtonLink href="/reports" variant="outline">
              Reports
            </ButtonLink>
            <ButtonLink href="/dispatch" variant="signal">
              Open dispatch
            </ButtonLink>
          </>
        }
      />

      {/* the metric strip — six numbers, not twelve tiles */}
      <MetricStrip>
        <MetricCell
          label="Trips today"
          value={kpis.tripsToday}
          hint={`${kpis.completedTrips} completed all time`}
        />
        <MetricCell
          label="Fleet engaged"
          value={`${kpis.fleetUtilisation.toFixed(0)}%`}
          hint={`${kpis.activeVehicles} of ${kpis.totalVehicles} vehicles`}
          tone={kpis.fleetUtilisation >= 70 ? "ok" : "caution"}
        />
        <MetricCell
          label="On-time arrival"
          value={`${kpis.onTimePct.toFixed(1)}%`}
          hint={`avg delay ${kpis.avgDelayMinutes} min`}
          tone={kpis.onTimePct >= 95 ? "ok" : kpis.onTimePct >= 85 ? "caution" : "critical"}
        />
        <MetricCell
          label="Passengers carried"
          value={n(kpis.bookings)}
          hint={`${kpis.cancelledBookings} cancelled bookings`}
        />
        <MetricCell
          label="Revenue invoiced"
          value={money(kpis.revenue)}
          hint={`${money(kpis.outstanding)} outstanding`}
        />
        <MetricCell
          label="Open incidents"
          value={kpis.openIncidents}
          hint={`${kpis.companies} clients · ${kpis.employees} staff`}
          tone={kpis.openIncidents > 0 ? "critical" : "ok"}
        />
      </MetricStrip>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Trips per day"
          subtitle="Last 14 days across the network"
        >
          <LineChart
            labels={perDay.map((d) => d.day.slice(5))}
            series={[
              {
                name: "Trips operated",
                color: "var(--series-1)",
                points: perDay.map((d) => d.total),
              },
              {
                name: "Completed",
                color: "var(--series-2)",
                points: perDay.map((d) => d.completed),
              },
              {
                name: "Passengers carried",
                color: "var(--series-3)",
                points: perDay.map((d) => d.passengers),
              },
            ]}
          />
        </Panel>

        <Panel title="Service quality">
          <div className="flex flex-col gap-4">
            <DonutStat
              value={kpis.onTimePct}
              label="Arrivals inside the 10 minute grace window"
            />
            <Meter
              label="Fleet utilisation"
              value={kpis.fleetUtilisation}
              tone={kpis.fleetUtilisation >= 70 ? "ok" : "caution"}
            />
            <Meter
              label="Seats filled today"
              value={seatsTotal ? (seatsBooked / seatsTotal) * 100 : 0}
              caption={`${seatsBooked} of ${seatsTotal}`}
              tone="caution"
            />
            <div className="rounded-[8px] border border-line bg-surface-2 px-3 py-2.5">
              <p className="eyebrow">Cost per passenger</p>
              <p className="numeric mt-1 text-[19px] font-medium text-ink">
                {money(kpis.costPerPassenger)}
              </p>
              <p className="mt-1 text-[11.5px] text-ink-3">
                Recorded maintenance spend against passengers carried.
              </p>
            </div>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Live fleet positions"
          subtitle="Vehicles on active duties, refreshed every 15 seconds"
        >
          {points.length ? (
            <LiveMap initial={points} pollUrl="/api/dispatch/live" />
          ) : (
            <EmptyState
              title="No active GPS positions"
              hint="Positions appear once a driver starts a trip from the driver app."
            />
          )}
        </Panel>

        <Panel title="Operational alerts" padded={false}>
          <ul className="divide-y divide-line">
            {pending.length ? (
              <li className="px-3.5 py-3">
                <Link
                  href="/bookings"
                  className="font-display text-[12.5px] font-medium text-signal-text transition-colors hover:underline"
                >
                  {pending.length} pending booking request{pending.length === 1 ? "" : "s"}
                </Link>
                <p className="mt-0.5 text-[11.5px] text-ink-3">
                  Approve before the next planning run.
                </p>
              </li>
            ) : null}
            {expiries.vehicleDocs.slice(0, 3).map((v) => (
              <li key={`v${v.id}`} className="px-3.5 py-3">
                <p className="font-display text-[12.5px] font-medium text-ink">
                  {v.label}
                </p>
                <p className="mt-0.5 text-[11.5px] text-ink-3">
                  Insurance {dateOnly(v.insurance)} · roadworthy {dateOnly(v.roadworthy)}
                </p>
              </li>
            ))}
            {expiries.driverDocs.slice(0, 2).map((d) => (
              <li key={`d${d.id}`} className="px-3.5 py-3">
                <p className="font-display text-[12.5px] font-medium text-ink">{d.label}</p>
                <p className="mt-0.5 text-[11.5px] text-ink-3">
                  Licence expires {dateOnly(d.license)}
                </p>
              </li>
            ))}
            {openIncidents.map((i) => (
              <li key={`i${i.incident.id}`} className="px-3.5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display text-[12.5px] font-medium text-ink">
                    {i.incident.type.replace(/_/g, " ")}
                  </p>
                  <StatusChip status={i.incident.severity} />
                </div>
                <p className="mt-0.5 truncate text-[11.5px] text-ink-3">
                  {i.company ?? "Platform"} · {dateOnly(i.incident.reportedAt)}
                </p>
              </li>
            ))}
            {!openIncidents.length && !expiries.vehicleDocs.length && !pending.length ? (
              <li className="px-3.5 py-6 text-center text-[12.5px] text-ink-3">
                Nothing needs your attention.
              </li>
            ) : null}
          </ul>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Today&apos;s departures" padded={false}>
          <TableWrap>
            <THead>
              <TR>
                <TH>Trip</TH>
                <TH>Client</TH>
                <TH>Depart</TH>
                <TH>Vehicle</TH>
                <TH align="right">Seats</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {upcoming.map((row) => (
                <TR key={row.trip.id}>
                  <TDPrimary>
                    <Link
                      href={`/trips/${row.trip.id}`}
                      className="numeric transition-colors hover:text-signal-text"
                    >
                      {row.trip.reference}
                    </Link>
                  </TDPrimary>
                  <TD>{row.company}</TD>
                  <TD className="numeric">{timeOnly(row.trip.scheduledDeparture)}</TD>
                  <TD>{row.vehicle ?? <span className="text-st-caution">unassigned</span>}</TD>
                  <TD align="right">
                    {row.trip.bookedSeats}/{row.trip.capacity}
                  </TD>
                  <TD>
                    <StatusChip status={row.trip.status} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          {!upcoming.length ? (
            <div className="p-4">
              <EmptyState
                title="No trips scheduled for today"
                hint="Plan a run from the Trips module."
              />
            </div>
          ) : null}
        </Panel>

        <Panel title="Revenue by corporate client" subtitle="Invoiced vs collected (GHS)">
          <BarChart
            data={revenue.map((r) => ({
              label: r.company.split(" ")[0],
              invoiced: r.total,
            }))}
            valueKey="invoiced"
            unit="GHS"
          />
          <div className="mt-4">
            <TableWrap>
              <THead>
                <TR>
                  <TH>Client</TH>
                  <TH align="right">Invoiced</TH>
                  <TH align="right">Collected</TH>
                  <TH align="right">Outstanding</TH>
                </TR>
              </THead>
              <TBody>
                {revenue.map((r) => (
                  <TR key={r.companyId}>
                    <TDPrimary>{r.company}</TDPrimary>
                    <TD align="right">{money(r.total)}</TD>
                    <TD align="right">{money(r.paid)}</TD>
                    <TD align="right">
                      <span
                        className={
                          r.total - r.paid > 0 ? "text-st-caution" : "text-st-ok"
                        }
                      >
                        {money(r.total - r.paid)}
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Driver performance"
          subtitle="Completed trips and punctuality"
          padded={false}
        >
          <TableWrap>
            <THead>
              <TR>
                <TH>Driver</TH>
                <TH align="right">Trips</TH>
                <TH align="right">On time</TH>
                <TH align="right">Passengers</TH>
                <TH align="right">Rating</TH>
              </TR>
            </THead>
            <TBody>
              {driverPerf.map((d) => (
                <TR key={d.driverId}>
                  <TDPrimary>{d.driver ?? "—"}</TDPrimary>
                  <TD align="right">{d.tripsCompleted}</TD>
                  <TD align="right">
                    {d.tripsCompleted
                      ? `${((d.onTime / d.tripsCompleted) * 100).toFixed(0)}%`
                      : "—"}
                  </TD>
                  <TD align="right">{d.passengers}</TD>
                  <TD align="right">{n(d.rating).toFixed(1)}</TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          {!driverPerf.length ? (
            <div className="p-4">
              <EmptyState title="No completed trips yet" />
            </div>
          ) : null}
        </Panel>

        <Panel title="Incident feed" subtitle="Open and acknowledged cases" padded={false}>
          <TableWrap>
            <THead>
              <TR>
                <TH>Type</TH>
                <TH>Severity</TH>
                <TH>Client</TH>
                <TH>Status</TH>
                <TH>Reported</TH>
              </TR>
            </THead>
            <TBody>
              {openIncidents.map((i) => (
                <TR key={i.incident.id}>
                  <TDPrimary>{i.incident.type.replace(/_/g, " ")}</TDPrimary>
                  <TD>
                    <StatusChip status={i.incident.severity} />
                  </TD>
                  <TD>{i.company ?? "Platform"}</TD>
                  <TD>
                    <StatusChip status={i.incident.status} />
                  </TD>
                  <TD className="numeric">{dateOnly(i.incident.reportedAt)}</TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          {!openIncidents.length ? (
            <div className="p-4">
              <EmptyState title="No open incidents" />
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}

function Meter({
  label,
  value,
  caption,
  tone = "live",
}: {
  label: string;
  value: number;
  caption?: string;
  tone?: "ok" | "caution" | "critical" | "live" | "idle";
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] text-ink-2">{label}</span>
        <span className="numeric text-[12.5px] text-ink">
          {caption ?? `${value.toFixed(0)}%`}
        </span>
      </div>
      <ProgressBar value={value} tone={tone} />
    </div>
  );
}
