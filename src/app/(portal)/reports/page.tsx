import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  companies,
  drivers,
  employees,
  incidents,
  invoices,
  maintenanceRecords,
  vehicles,
} from "@/db/schema";
import { BarChart, LineChart, SERIES } from "@/components/charts";
import {
  Button,
  ButtonLink,
  EmptyState,
  Field,
  Input,
  MetricCell,
  MetricStrip,
  PageHeader,
  Panel,
  Select,
  StatusChip,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui";
import { companyScope, requireSection } from "@/lib/auth";
import { getDriverPerformance, getKpis, getRouteEfficiency, getTripsPerDay } from "@/lib/queries";
import { dateOnly, humanize, isoDaysFromNow, money, n, todayISO } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; company?: string }>;
}) {
  const user = await requireSection("reports");
  const scope = companyScope(user);
  const { from = isoDaysFromNow(-30), to = todayISO(), company = "" } = await searchParams;
  const companyId = scope ?? (company ? Number(company) : null);

  const [
    kpis,
    perDay,
    driverPerf,
    routeEff,
    companyOptions,
    incidentAgg,
    maintenanceAgg,
    bookingAgg,
    revenueAgg,
  ] = await Promise.all([
    getKpis(companyId),
    getTripsPerDay(companyId, 30),
    getDriverPerformance(10),
    getRouteEfficiency(companyId),
    db.select({ id: companies.id, name: companies.name }).from(companies),
    db
      .select({ type: incidents.type, severity: incidents.severity, v: sql<number>`count(*)` })
      .from(incidents)
      .where(companyId ? eq(incidents.companyId, companyId) : undefined)
      .groupBy(incidents.type, incidents.severity)
      .orderBy(sql`count(*) desc`),
    db
      .select({
        total: sql<string>`coalesce(sum(${maintenanceRecords.cost}), 0)`,
        records: sql<number>`count(*)`,
      })
      .from(maintenanceRecords),
    db
      .select({
        total: sql<number>`count(*)`,
        cancelled: sql<number>`sum(case when ${bookings.status} = 'cancelled' then 1 else 0 end)`,
        noShow: sql<number>`sum(case when ${bookings.status} = 'no_show' then 1 else 0 end)`,
        completed: sql<number>`sum(case when ${bookings.status} = 'completed' then 1 else 0 end)`,
      })
      .from(bookings)
      .where(companyId ? eq(bookings.companyId, companyId) : undefined),
    db
      .select({
        company: companies.name,
        invoiced: sql<string>`coalesce(sum(${invoices.total}), 0)`,
        paid: sql<string>`coalesce(sum(${invoices.amountPaid}), 0)`,
      })
      .from(invoices)
      .innerJoin(companies, eq(companies.id, invoices.companyId))
      .where(companyId ? eq(invoices.companyId, companyId) : undefined)
      .groupBy(companies.name),
  ]);

  const vehicleUtil = await db
    .select({
      registrationNo: vehicles.registrationNo,
      model: vehicles.model,
      status: vehicles.status,
      capacity: vehicles.capacity,
      trips: sql<number>`(select count(*) from trips t where t.vehicle_id = ${vehicles.id})`,
      seats: sql<number>`(select coalesce(sum(t.booked_seats), 0) from trips t where t.vehicle_id = ${vehicles.id})`,
      cost: sql<string>`(select coalesce(sum(m.cost), 0) from maintenance_records m where m.vehicle_id = ${vehicles.id})`,
    })
    .from(vehicles)
    .orderBy(sql`(select count(*) from trips t where t.vehicle_id = ${vehicles.id}) desc`)
    .limit(10);

  const staffCount = await db
    .select({ company: companies.name, employees: sql<number>`count(*)` })
    .from(employees)
    .innerJoin(companies, eq(companies.id, employees.companyId))
    .where(companyId ? eq(employees.companyId, companyId) : undefined)
    .groupBy(companies.name);

  const [driverStats] = await db
    .select({
      total: sql<number>`count(*)`,
      avgRating: sql<string>`coalesce(avg(${drivers.ratingAvg}), 0)`,
    })
    .from(drivers);

  const exportUrl = `/api/reports/export?from=${from}&to=${to}${
    companyId ? `&company=${companyId}` : ""
  }`;

  return (
    <div>
      <PageHeader
        eyebrow="Analytics"
        title="Reports & business intelligence"
        subtitle="Operational, financial and safety analytics with server-generated CSV export."
        actions={
          <>
            <ButtonLink href={exportUrl} variant="outline" size="sm">
              Operating report CSV
            </ButtonLink>
            <ButtonLink href="/api/reports/export?type=trips" variant="outline" size="sm">
              Trips CSV
            </ButtonLink>
          </>
        }
      />

      <Panel title="Filter the analysis" eyebrow="Period">
        <form className="grid gap-3 sm:grid-cols-4" method="get">
          <Field label="From" name="from" type="date" defaultValue={from}>
            <Input id="from" name="from" type="date" defaultValue={from} />
          </Field>
          <Field label="To" name="to" type="date" defaultValue={to}>
            <Input id="to" name="to" type="date" defaultValue={to} />
          </Field>
          {scope ? (
            <Field
              label="Client"
              name="company"
              hint="Scoped to your own company."
            >
              <Input id="company" name="company" value="Your company" disabled readOnly />
            </Field>
          ) : (
            <Field label="Client" name="company" htmlFor="company">
              <Select id="company" name="company" defaultValue={company}>
                <option value="">All clients</option>
                {companyOptions.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="flex items-end">
            <Button type="submit" variant="signal" className="w-full">
              Apply
            </Button>
          </div>
        </form>
      </Panel>

      <div className="mt-4">
        <MetricStrip>
          <MetricCell label="Corporate clients" value={n(kpis.companies)} />
          <MetricCell label="Employees" value={n(kpis.employees)} />
          <MetricCell label="Bookings" value={n(kpis.bookings)} />
          <MetricCell
            label="Completed journeys"
            value={n(kpis.completedTrips)}
            tone="ok"
          />
          <MetricCell
            label="Cancelled"
            value={n(kpis.cancelledBookings)}
            tone={kpis.cancelledBookings > 0 ? "critical" : "idle"}
          />
          <MetricCell
            label="Fleet utilisation"
            value={`${kpis.fleetUtilisation.toFixed(0)}%`}
            tone="live"
          />
        </MetricStrip>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          title="Trip volume trend"
          subtitle="Last 30 days"
          eyebrow="Volume"
          className="lg:col-span-2"
        >
          <LineChart
            labels={perDay.map((d) => d.day.slice(5))}
            series={[
              { name: "Trips", color: SERIES[0], points: perDay.map((d) => d.total) },
              { name: "Completed", color: SERIES[1], points: perDay.map((d) => d.completed) },
              { name: "Passengers", color: SERIES[2], points: perDay.map((d) => d.passengers) },
            ]}
          />
        </Panel>

        <Panel title="Service quality" eyebrow="SLA" padded={false}>
          <TableWrap>
            <THead>
              <TH>Metric</TH>
              <TH align="right">Value</TH>
            </THead>
            <TBody>
              <TR>
                <TD>On-time arrivals</TD>
                <TD align="right">{kpis.onTimePct.toFixed(1)}%</TD>
              </TR>
              <TR>
                <TD>Average delay</TD>
                <TD align="right">{kpis.avgDelayMinutes} min</TD>
              </TR>
              <TR>
                <TD>Cost per passenger</TD>
                <TD align="right">{money(kpis.costPerPassenger)}</TD>
              </TR>
              <TR>
                <TD>Open incidents</TD>
                <TD align="right">{n(kpis.openIncidents)}</TD>
              </TR>
              <TR>
                <TD>Maintenance spend</TD>
                <TD align="right">{money(maintenanceAgg[0]?.total)}</TD>
              </TR>
              <TR>
                <TD>Driver average rating</TD>
                <TD align="right">{n(driverStats?.avgRating).toFixed(2)} / 5</TD>
              </TR>
              <TR>
                <TD>Completed bookings</TD>
                <TD align="right">{n(Number(bookingAgg[0]?.completed ?? 0))}</TD>
              </TR>
              <TR>
                <TD>No-shows</TD>
                <TD align="right">{n(Number(bookingAgg[0]?.noShow ?? 0))}</TD>
              </TR>
            </TBody>
          </TableWrap>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Revenue per client" eyebrow="Finance" padded={false}>
          <TableWrap>
            <THead>
              <TH>Client</TH>
              <TH align="right">Invoiced</TH>
              <TH align="right">Collected</TH>
              <TH align="right">Outstanding</TH>
            </THead>
            <TBody>
              {revenueAgg.map((r) => (
                <TR key={r.company}>
                  <TDPrimary>{r.company}</TDPrimary>
                  <TD align="right">{money(r.invoiced)}</TD>
                  <TD align="right">{money(r.paid)}</TD>
                  <TD align="right">{money(n(r.invoiced) - n(r.paid))}</TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          <div className="border-t border-line p-4">
            <BarChart
              data={revenueAgg.map((r) => ({
                label: r.company.split(" ")[0],
                value: n(r.invoiced),
              }))}
              tone={SERIES[0]}
              unit="GHS"
            />
          </div>
        </Panel>

        <Panel title="Driver performance" eyebrow="Fleet" padded={false}>
          <TableWrap>
            <THead>
              <TH>Driver</TH>
              <TH align="right">Trips</TH>
              <TH align="right">On time</TH>
              <TH align="right">Passengers</TH>
              <TH align="right">Rating</TH>
            </THead>
            <TBody>
              {driverPerf.map((d) => (
                <TR key={d.driverId ?? d.driver}>
                  <TDPrimary>{d.driver}</TDPrimary>
                  <TD align="right">{n(d.tripsCompleted)}</TD>
                  <TD align="right">
                    {d.tripsCompleted
                      ? `${((d.onTime / d.tripsCompleted) * 100).toFixed(0)}%`
                      : "—"}
                  </TD>
                  <TD align="right">{n(d.passengers)}</TD>
                  <TD align="right">{n(d.rating).toFixed(1)} / 5</TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          {!driverPerf.length ? (
            <div className="p-4">
              <EmptyState title="No trip data yet" />
            </div>
          ) : null}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Vehicle utilisation & maintenance cost"
          eyebrow="Assets"
          padded={false}
        >
          <TableWrap>
            <THead>
              <TH>Vehicle</TH>
              <TH>Status</TH>
              <TH align="right">Trips</TH>
              <TH align="right">Seats sold</TH>
              <TH align="right">Fill</TH>
              <TH align="right">Maintenance</TH>
            </THead>
            <TBody>
              {vehicleUtil.map((v) => (
                <TR key={v.registrationNo}>
                  <TDPrimary>
                    <p>{v.registrationNo}</p>
                    <p className="text-[11.5px] font-normal text-ink-3">{v.model}</p>
                  </TDPrimary>
                  <TD>
                    <StatusChip status={v.status} />
                  </TD>
                  <TD align="right">{n(Number(v.trips))}</TD>
                  <TD align="right">{n(Number(v.seats))}</TD>
                  <TD align="right">
                    {Number(v.trips)
                      ? (
                          ((Number(v.seats) / (Number(v.trips) * v.capacity)) * 100).toFixed(0)
                        )
                      : 0}
                    %
                  </TD>
                  <TD align="right">{money(v.cost)}</TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        </Panel>

        <Panel title="Route efficiency" eyebrow="Network" padded={false}>
          <TableWrap>
            <THead>
              <TH>Client</TH>
              <TH align="right">Avg planned km</TH>
              <TH align="right">Avg passengers</TH>
              <TH align="right">Trips</TH>
            </THead>
            <TBody>
              {routeEff.map((r, i) => (
                <TR key={`${r.routeId}-${i}`}>
                  <TDPrimary>{r.company}</TDPrimary>
                  <TD align="right">{r.plannedKm.toFixed(1)}</TD>
                  <TD align="right">{r.passengers.toFixed(1)}</TD>
                  <TD align="right">{n(r.tripsCount)}</TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          <div className="border-t border-line">
            <p className="eyebrow px-4 pb-2 pt-3">Incident frequency</p>
            <TableWrap>
              <THead>
                <TH>Type</TH>
                <TH>Severity</TH>
                <TH align="right">Count</TH>
              </THead>
              <TBody>
                {incidentAgg.map((i) => (
                  <TR key={`${i.type}-${i.severity}`}>
                    <TDPrimary>{humanize(i.type)}</TDPrimary>
                    <TD>
                      <StatusChip
                        tone={
                          i.severity === "high"
                            ? "critical"
                            : i.severity === "medium"
                              ? "caution"
                              : "idle"
                        }
                        label={humanize(i.severity)}
                      />
                    </TD>
                    <TD align="right">{n(Number(i.v))}</TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          </div>
        </Panel>
      </div>

      <Panel
        className="mt-4"
        title="Employees per client"
        subtitle="Service coverage"
        eyebrow="Coverage"
        padded={false}
      >
        <TableWrap>
          <THead>
            <TH>Client</TH>
            <TH align="right">Registered employees</TH>
          </THead>
          <TBody>
            {staffCount.map((s) => (
              <TR key={s.company}>
                <TDPrimary>{s.company}</TDPrimary>
                <TD align="right">{n(Number(s.employees))}</TD>
              </TR>
            ))}
          </TBody>
        </TableWrap>
      </Panel>

      <p className="mt-4 text-[12px] text-ink-3">
        Reporting period {dateOnly(from)} → {dateOnly(to)}. CSV exports are generated
        server side and respect your tenant scope; PDF output uses the browser print
        dialog with the print stylesheet.
      </p>
    </div>
  );
}
