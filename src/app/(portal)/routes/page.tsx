import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  branches,
  companies,
  employees,
  routeStops,
  routes,
  stops,
  trips,
} from "@/db/schema";
import { ActionForm, InlineActionForm } from "@/components/action-form";
import {
  EmptyState,
  MetricStrip,
  MetricCell,
  Notice,
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
import { Field } from "@/components/ui/input";
import { createRouteAction, createStopAction, toggleRouteAction } from "@/app/actions/admin";
import { planTripsAction } from "@/app/actions/ops";
import { companyScope, requireSection } from "@/lib/auth";
import { distanceKm, humanize, n, todayISO } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function RoutesPage() {
  const user = await requireSection("routes");
  const scope = companyScope(user);

  const routeRows = await db
    .select({
      route: routes,
      company: companies.name,
      branch: branches.name,
      stopCount: sql<number>`(select count(*) from route_stops rs where rs.route_id = ${routes.id})`,
      tripCount: sql<number>`(select count(*) from trips t where t.route_id = ${routes.id})`,
      avgLoad: sql<string>`(select coalesce(avg(t.booked_seats), 0) from trips t where t.route_id = ${routes.id})`,
    })
    .from(routes)
    .innerJoin(companies, eq(companies.id, routes.companyId))
    .leftJoin(branches, eq(branches.id, routes.branchId))
    .where(scope ? eq(routes.companyId, scope) : undefined)
    .orderBy(asc(companies.name), asc(routes.name));

  const stopRows = await db
    .select({
      stop: stops,
      company: companies.name,
      pickupCount: sql<number>`(select count(*) from bookings b where b.pickup_stop_id = ${stops.id})`,
    })
    .from(stops)
    .innerJoin(companies, eq(companies.id, stops.companyId))
    .where(scope ? eq(stops.companyId, scope) : undefined)
    .orderBy(asc(stops.name));

  const routeStopRows = routeRows.length
    ? await db
        .select({
          routeId: routeStops.routeId,
          sequence: routeStops.sequence,
          name: stops.name,
          offsetMinutes: routeStops.offsetMinutes,
        })
        .from(routeStops)
        .innerJoin(stops, eq(stops.id, routeStops.stopId))
        .where(inArray(routeStops.routeId, routeRows.map((r) => r.route.id)))
        .orderBy(asc(routeStops.routeId), asc(routeStops.sequence))
    : [];

  const companyOptions = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .orderBy(asc(companies.name));
  const branchOptions = await db
    .select({ id: branches.id, name: branches.name, companyId: branches.companyId })
    .from(branches);

  const zoneStats = await db
    .select({ zone: employees.zone, total: sql<number>`count(*)` })
    .from(employees)
    .where(scope ? eq(employees.companyId, scope) : undefined)
    .groupBy(employees.zone)
    .orderBy(sql`count(*) desc`);

  const [tripLoad] = await db
    .select({
      avgSeats: sql<number>`coalesce(avg(${trips.bookedSeats}), 0)`,
      avgCapacity: sql<number>`coalesce(avg(${trips.capacity}), 0)`,
      avgKm: sql<number>`coalesce(avg(${trips.plannedKm}), 0)`,
    })
    .from(trips)
    .where(scope ? eq(trips.companyId, scope) : undefined);

  const fill = n(tripLoad?.avgCapacity)
    ? (n(tripLoad?.avgSeats) / n(tripLoad?.avgCapacity)) * 100
    : 0;

  return (
    <div>
      <PageHeader
        eyebrow="Planning"
        title="Routes &amp; stops"
        subtitle="Define corridors, stop sequences and let the planner group passengers into capacity-aware trips."
      />

      <MetricStrip>
        <MetricCell
          label="Active routes"
          value={routeRows.filter((r) => r.route.active).length}
          hint={`${routeRows.length} total`}
        />
        <MetricCell label="Stops" value={stopRows.length} />
        <MetricCell
          label="Average seat fill"
          value={`${fill.toFixed(0)}%`}
          tone={fill >= 70 ? "ok" : "caution"}
          hint={`${n(tripLoad?.avgSeats).toFixed(1)} of ${n(tripLoad?.avgCapacity).toFixed(1)} seats`}
        />
        <MetricCell
          label="Average distance"
          value={`${n(tripLoad?.avgKm).toFixed(1)} km`}
          hint="planned per trip"
        />
      </MetricStrip>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Route register"
          subtitle={`${routeRows.length} corridors`}
          padded={false}
        >
          <TableWrap>
            <THead>
              <TR>
                <TH>Route</TH>
                <TH>Client</TH>
                <TH>Direction</TH>
                <TH>Corridor</TH>
                <TH align="right">Stops</TH>
                <TH align="right">Trips</TH>
                <TH align="right">Avg load</TH>
                <TH>Status</TH>
                <TH align="right" />
              </TR>
            </THead>
            <TBody>
              {routeRows.map((r) => (
                <TR key={r.route.id}>
                  <TDPrimary>
                    {r.route.name}
                    <p className="numeric mt-0.5 text-[11px] font-normal text-ink-3">
                      {n(r.route.estimatedKm)} km · {r.route.estimatedMinutes} min
                    </p>
                    <ol className="mt-1 space-y-0.5 text-[10.5px] font-normal text-ink-3">
                      {routeStopRows
                        .filter((rs) => rs.routeId === r.route.id)
                        .map((rs) => (
                          <li key={`${rs.routeId}-${rs.sequence}`} className="numeric">
                            {rs.sequence}. {rs.name} (+{rs.offsetMinutes}m)
                          </li>
                        ))}
                    </ol>
                  </TDPrimary>
                  <TD>
                    {r.company}
                    <p className="mt-0.5 text-[11px] text-ink-3">{r.branch ?? "—"}</p>
                  </TD>
                  <TD>{humanize(r.route.direction)}</TD>
                  <TD>{r.route.zone ?? "—"}</TD>
                  <TD align="right">{Number(r.stopCount)}</TD>
                  <TD align="right">{Number(r.tripCount)}</TD>
                  <TD align="right">{n(r.avgLoad).toFixed(1)}</TD>
                  <TD>
                    <StatusChip status={r.route.active ? "active" : "inactive"} />
                  </TD>
                  <TD align="right">
                    <InlineActionForm
                      action={toggleRouteAction}
                      hiddenFields={{
                        id: r.route.id,
                        active: r.route.active ? "false" : "true",
                      }}
                      submitLabel={r.route.active ? "Deactivate" : "Activate"}
                      variant="ghost"
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          {!routeRows.length ? (
            <div className="p-4">
              <EmptyState title="No routes defined" />
            </div>
          ) : null}
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel
            title="Run the route planner"
            subtitle="Groups approved bookings into trips"
          >
            <Notice tone="caution" className="text-[11.5px]">
              Heuristic planner: zone clustering, nearest-neighbour sequencing,
              smallest-suitable-vehicle allocation. The interface is ready for an
              OR-Tools VRP solver or a live traffic feed.
            </Notice>
            <ActionForm action={planTripsAction} submitLabel="Plan trips" className="mt-3">
              <div className="flex flex-col gap-3">
                <Field
                  label="Service date"
                  name="tripDate"
                  type="date"
                  required
                  defaultValue={todayISO()}
                />
                <Field
                  label="Direction"
                  name="direction"
                  options={[
                    { value: "home_to_office", label: "Home to office (pickup)" },
                    { value: "office_to_home", label: "Office to home (drop-off)" },
                  ]}
                />
                {!scope ? (
                  <Field
                    label="Client (optional)"
                    name="companyId"
                    options={[
                      { value: "", label: "All clients" },
                      ...companyOptions.map((c) => ({
                        value: String(c.id),
                        label: c.name,
                      })),
                    ]}
                  />
                ) : null}
              </div>
            </ActionForm>
          </Panel>

          <Panel title="Create a route">
            <ActionForm action={createRouteAction} submitLabel="Create route" resetOnSuccess>
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
                <Field
                  label="Route name"
                  name="name"
                  required
                  placeholder="Morning pickup — Dansaman / Lapaz"
                />
                <Field
                  label="Direction"
                  name="direction"
                  options={[
                    { value: "home_to_office", label: "Home to office" },
                    { value: "office_to_home", label: "Office to home" },
                    { value: "inter_office", label: "Inter office" },
                    { value: "ad_hoc", label: "Ad hoc" },
                  ]}
                />
                <Field
                  label="Corridor / zone"
                  name="zone"
                  placeholder="Western corridor"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="Estimated km"
                    name="estimatedKm"
                    type="number"
                    step="0.1"
                  />
                  <Field
                    label="Estimated minutes"
                    name="estimatedMinutes"
                    type="number"
                  />
                </div>
                <Field
                  label="Branch served"
                  name="branchId"
                  options={[
                    { value: "", label: "—" },
                    ...branchOptions
                      .filter((b) => !scope || b.companyId === scope)
                      .map((b) => ({ value: String(b.id), label: b.name })),
                  ]}
                />
                <fieldset>
                  <legend className="mb-1.5 font-display text-[12.5px] font-medium text-ink-2">
                    Stop sequence (ctrl / cmd-click for multiple)
                  </legend>
                  <select
                    name="stopIds"
                    multiple
                    size={6}
                    className="w-full rounded-[8px] border border-line-strong bg-surface-1 px-3 py-2 text-[12.5px] text-ink focus:border-signal focus:outline-none focus:ring-2 focus:ring-signal/25"
                  >
                    {stopRows.map((s) => (
                      <option key={s.stop.id} value={s.stop.id}>
                        {s.stop.name} ({s.stop.zone ?? "—"})
                      </option>
                    ))}
                  </select>
                </fieldset>
              </div>
            </ActionForm>
          </Panel>

          <Panel title="Add a stop">
            <ActionForm action={createStopAction} submitLabel="Add stop" resetOnSuccess>
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
                <Field
                  label="Stop name"
                  name="name"
                  required
                  placeholder="Dansoman Junction"
                />
                <Field label="Zone" name="zone" placeholder="Dansoman" />
                <Field label="Address" name="address" />
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="Latitude"
                    name="lat"
                    type="number"
                    step="0.0001"
                    defaultValue={5.548}
                  />
                  <Field
                    label="Longitude"
                    name="lng"
                    type="number"
                    step="0.0001"
                    defaultValue={-0.241}
                  />
                </div>
              </div>
            </ActionForm>
          </Panel>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Stop register" padded={false}>
          <TableWrap>
            <THead>
              <TR>
                <TH>Stop</TH>
                <TH>Client</TH>
                <TH>Zone</TH>
                <TH>Coordinates</TH>
                <TH align="right">Bookings</TH>
              </TR>
            </THead>
            <TBody>
              {stopRows.map((s) => (
                <TR key={s.stop.id}>
                  <TDPrimary>{s.stop.name}</TDPrimary>
                  <TD>{s.company}</TD>
                  <TD>{s.stop.zone ?? "—"}</TD>
                  <TD className="numeric text-[11.5px]">
                    {s.stop.lat ?? "—"}, {s.stop.lng ?? "—"}
                  </TD>
                  <TD align="right">{Number(s.pickupCount)}</TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          {!stopRows.length ? (
            <div className="p-4">
              <EmptyState title="No stops" />
            </div>
          ) : null}
        </Panel>

        <Panel
          title="Passenger density by zone"
          subtitle="Drives corridor planning and vehicle sizing"
          padded={false}
        >
          <TableWrap>
            <THead>
              <TR>
                <TH>Zone</TH>
                <TH align="right">Employees</TH>
                <TH>Suggested vehicle</TH>
              </TR>
            </THead>
            <TBody>
              {zoneStats.map((z) => (
                <TR key={z.zone ?? "none"}>
                  <TDPrimary>{z.zone ?? "Unzoned"}</TDPrimary>
                  <TD align="right">{Number(z.total)}</TD>
                  <TD>
                    {Number(z.total) > 20
                      ? "33-seat coach"
                      : Number(z.total) > 12
                        ? "18–24 seat bus"
                        : Number(z.total) > 5
                          ? "14-seat minibus"
                          : "Sedan / SUV"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          <p className="border-t border-line px-3.5 py-3 text-[11.5px] text-ink-3">
            Distances are computed with the haversine formula; the current corridor
            sample spans{" "}
            {distanceKm({ lat: 5.534, lng: -0.416 }, { lat: 5.6837, lng: -0.1664 }).toFixed(1)}{" "}
            km (Kasoa → Madina).
          </p>
        </Panel>
      </div>
    </div>
  );
}
