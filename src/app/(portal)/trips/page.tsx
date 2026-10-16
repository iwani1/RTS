import Link from "next/link";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, drivers, routes, trips, vehicles } from "@/db/schema";
import { ActionForm } from "@/components/action-form";
import {
  EmptyState,
  MetricStrip,
  MetricCell,
  PageHeader,
  Panel,
  StatusChip,
  TableWrap,
  TBody,
  TD,
  TDPrimary,
  THead,
  TH,
  TR,
} from "@/components/ui";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { createTripAction, planTripsAction } from "@/app/actions/ops";
import { companyScope, requireSection } from "@/lib/auth";
import { dateOnly, humanize, n, timeOnly, todayISO } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUSES = [
  "scheduled",
  "dispatching",
  "in_progress",
  "delayed",
  "breakdown",
  "completed",
  "cancelled",
];

export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; company?: string; status?: string }>;
}) {
  const user = await requireSection("trips");
  const scope = companyScope(user);
  const { date = todayISO(), company = "", status = "" } = await searchParams;

  const filters = [
    eq(trips.tripDate, date),
    scope ? eq(trips.companyId, scope) : undefined,
    company && !scope ? eq(trips.companyId, Number(company)) : undefined,
    status ? eq(trips.status, status as "scheduled") : undefined,
  ].filter(Boolean);

  const rows = await db
    .select({
      trip: trips,
      company: companies.name,
      route: routes.name,
      vehicle: vehicles.registrationNo,
      capacity: vehicles.capacity,
      driver: drivers.fullName,
      driverPhone: drivers.phone,
    })
    .from(trips)
    .innerJoin(companies, eq(companies.id, trips.companyId))
    .leftJoin(routes, eq(routes.id, trips.routeId))
    .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
    .leftJoin(drivers, eq(drivers.id, trips.driverId))
    .where(and(...filters))
    .orderBy(asc(trips.scheduledDeparture))
    .limit(100);

  const [summary] = await db
    .select({
      total: sql<number>`count(*)`,
      completed: sql<number>`sum(case when ${trips.status} = 'completed' then 1 else 0 end)`,
      inProgress: sql<number>`sum(case when ${trips.status} = 'in_progress' then 1 else 0 end)`,
      unassigned: sql<number>`sum(case when ${trips.vehicleId} is null or ${trips.driverId} is null then 1 else 0 end)`,
      seats: sql<number>`coalesce(sum(${trips.bookedSeats}), 0)`,
      capacity: sql<number>`coalesce(sum(${trips.capacity}), 0)`,
      km: sql<number>`coalesce(sum(${trips.plannedKm}), 0)`,
    })
    .from(trips)
    .where(and(eq(trips.tripDate, date), scope ? eq(trips.companyId, scope) : undefined));

  const companyOptions = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .orderBy(asc(companies.name));
  const vehicleOptions = await db
    .select()
    .from(vehicles)
    .orderBy(asc(vehicles.registrationNo));
  const driverOptions = await db
    .select()
    .from(drivers)
    .orderBy(asc(drivers.fullName));
  const routeOptions = await db
    .select({
      id: routes.id,
      name: routes.name,
      companyId: routes.companyId,
      direction: routes.direction,
    })
    .from(routes)
    .orderBy(asc(routes.name));
  const total = Number(summary?.total ?? 0);
  const seats = Number(summary?.seats ?? 0);
  const capacity = Number(summary?.capacity ?? 0);
  const unassigned = Number(summary?.unassigned ?? 0);

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Trip management"
        subtitle="Scheduled journeys, assigned vehicles and drivers, seat load and lifecycle status."
        actions={
          <ButtonLink href="/dispatch" variant="outline">
            Live dispatch board
          </ButtonLink>
        }
      />

      <MetricStrip>
        <MetricCell label="Trips on date" value={total} />
        <MetricCell label="Completed" value={Number(summary?.completed ?? 0)} tone="ok" />
        <MetricCell label="In progress" value={Number(summary?.inProgress ?? 0)} tone="live" />
        <MetricCell
          label="Missing resource"
          value={unassigned}
          tone={unassigned ? "caution" : "ok"}
        />
        <MetricCell
          label="Seat fill"
          value={`${capacity ? ((seats / capacity) * 100).toFixed(0) : 0}%`}
          hint={`${n(summary?.km).toFixed(0)} km planned`}
        />
      </MetricStrip>

      <Panel className="mt-4" title="Filters" padded>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <Field
            label="Service date"
            name="date"
            type="date"
            defaultValue={date}
            className="w-[168px]"
          />
          {!scope ? (
            <Field
              label="Client"
              name="company"
              className="w-[200px]"
              options={[
                { value: "", label: "All clients" },
                ...companyOptions.map((c) => ({ value: String(c.id), label: c.name })),
              ]}
            />
          ) : null}
          <Field
            label="Status"
            name="status"
            className="w-[180px]"
            options={[
              { value: "", label: "Any status" },
              ...STATUSES.map((s) => ({ value: s, label: humanize(s) })),
            ]}
          />
          <Button type="submit" variant="signal" size="sm">
            Apply
          </Button>
          <ButtonLink href={`/trips?date=${date}`} variant="ghost" size="sm">
            Reset
          </ButtonLink>
        </form>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title={`Trips for ${dateOnly(date)}`}
          subtitle={`${rows.length} shown`}
          padded={false}
        >
          <TableWrap>
            <THead>
              <TR>
                <TH>Reference</TH>
                <TH>Client / corridor</TH>
                <TH>Departure</TH>
                <TH>Vehicle &amp; driver</TH>
                <TH align="right">Seats</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.trip.id}>
                  <TDPrimary>
                    <Link
                      href={`/trips/${r.trip.id}`}
                      className="numeric transition-colors hover:text-signal-text"
                    >
                      {r.trip.reference}
                    </Link>
                    <p className="mt-0.5 text-[11px] font-normal text-ink-3">
                      {humanize(r.trip.direction)}
                    </p>
                  </TDPrimary>
                  <TD>
                    {r.company}
                    <p className="mt-0.5 text-[11px] text-ink-3">
                      {r.route ?? "Unassigned corridor"}
                    </p>
                  </TD>
                  <TD>
                    <span className="numeric">{timeOnly(r.trip.scheduledDeparture)}</span>
                    <p className="mt-0.5 text-[11px] text-ink-3">
                      → {timeOnly(r.trip.scheduledArrival)}
                    </p>
                  </TD>
                  <TD>
                    {r.vehicle ?? <span className="text-st-caution">no vehicle</span>}
                    <p className="mt-0.5 text-[11px] text-ink-3">
                      {r.driver ?? <span className="text-st-caution">no driver</span>}
                    </p>
                  </TD>
                  <TD align="right">
                    {r.trip.bookedSeats}/{r.trip.capacity}
                  </TD>
                  <TD>
                    <StatusChip status={r.trip.status} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          {!rows.length ? (
            <div className="p-4">
              <EmptyState
                title="No trips for this date"
                hint="Create one manually or run the route planner."
              />
            </div>
          ) : null}
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Run the planner" subtitle="Creates trips from approved bookings">
            <ActionForm action={planTripsAction} submitLabel="Plan trips">
              <div className="flex flex-col gap-3">
                <Field
                  label="Service date"
                  name="tripDate"
                  type="date"
                  required
                  defaultValue={date}
                />
                <Field
                  label="Direction"
                  name="direction"
                  options={[
                    { value: "home_to_office", label: "Home to office" },
                    { value: "office_to_home", label: "Office to home" },
                  ]}
                />
                {!scope ? (
                  <Field
                    label="Client (optional)"
                    name="companyId"
                    options={[
                      { value: "", label: "All clients" },
                      ...companyOptions.map((c) => ({ value: String(c.id), label: c.name })),
                    ]}
                  />
                ) : null}
              </div>
            </ActionForm>
          </Panel>

          <Panel title="Create a trip manually" subtitle="Emergency or ad-hoc duties">
            <ActionForm
              action={createTripAction}
              submitLabel="Create trip"
              resetOnSuccess
            >
              <div className="flex flex-col gap-3">
                {!scope ? (
                  <Field
                    label="Client"
                    name="companyId"
                    required
                    options={companyOptions.map((c) => ({
                      value: String(c.id),
                      label: c.name,
                    }))}
                  />
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="Service date"
                    name="tripDate"
                    type="date"
                    required
                    defaultValue={date}
                  />
                  <Field
                    label="Direction"
                    name="direction"
                    options={[
                      { value: "home_to_office", label: "Home to office" },
                      { value: "office_to_home", label: "Office to home" },
                      { value: "inter_office", label: "Inter office" },
                      { value: "ad_hoc", label: "Ad hoc / emergency" },
                    ]}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="Departure"
                    name="scheduledDeparture"
                    type="time"
                    required
                    defaultValue="05:30"
                  />
                  <Field
                    label="Arrival (planned)"
                    name="scheduledArrival"
                    type="time"
                    defaultValue="07:00"
                  />
                </div>
                <Field
                  label="Corridor"
                  name="routeId"
                  options={[
                    { value: "", label: "—" },
                    ...routeOptions
                      .filter((r) => !scope || r.companyId === scope)
                      .map((r) => ({ value: String(r.id), label: r.name })),
                  ]}
                />
                <Field
                  label="Vehicle"
                  name="vehicleId"
                  options={[
                    { value: "", label: "Assign later" },
                    ...vehicleOptions
                      .filter((v) => v.status === "available" || v.status === "assigned")
                      .map((v) => ({
                        value: String(v.id),
                        label: `${v.registrationNo} · ${v.capacity} seats`,
                      })),
                  ]}
                  hint="Vehicles under maintenance or out of service are excluded."
                />
                <Field
                  label="Driver"
                  name="driverId"
                  options={[
                    { value: "", label: "Assign later" },
                    ...driverOptions
                      .filter((d) => d.status !== "unavailable")
                      .map((d) => ({
                        value: String(d.id),
                        label: `${d.fullName} · ${d.phone}`,
                      })),
                  ]}
                />
                <Field
                  label="Planned distance (km)"
                  name="plannedKm"
                  type="number"
                  step="0.1"
                />
                <Field label="Notes" name="notes" type="textarea" />
              </div>
            </ActionForm>
          </Panel>
        </div>
      </div>
    </div>
  );
}
