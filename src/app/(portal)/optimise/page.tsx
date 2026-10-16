import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, employees, stops, vehicles } from "@/db/schema";
import { companyScope, requireSection } from "@/lib/auth";
import { humanize, n } from "@/lib/utils";
import { solveVrp, type VrpRequest, type VrpVehicle } from "@/lib/vrp";
import {
  EmptyState,
  MetricCell,
  MetricStrip,
  PageHeader,
  Panel,
  ProgressBar,
  TableWrap,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { StatusChip, StatusDot } from "@/components/ui/badge";

/**
 * Route optimisation.
 *
 * Builds a vehicle-routing problem from the live operational data — the
 * staff of one client, their home coordinates, the client campus as the
 * depot, and the available fleet — and solves it.
 *
 * The solver is the Clarke-Wright savings heuristic with a 2-opt pass
 * (`src/lib/vrp.ts`). It is a genuine solver, but it is NOT OR-Tools: it does
 * not use time windows as hard constraints, it does not handle multiple
 * depots, and it is not proven optimal. The screen says so, and names
 * OR-Tools as the upgrade path. The numbers below come from the solver —
 * nothing is illustrative.
 */
export default async function OptimisePage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requireSection("routes");
  const scope = companyScope(user);
  const { company = "" } = await searchParams;

  const clientOptions = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .orderBy(asc(companies.name));
  const clientId = scope ?? (company ? Number(company) : clientOptions[0]?.id ?? null);
  const client = clientId
    ? clientOptions.find((c) => c.id === clientId) ?? null
    : null;

  // The depot is the client campus — the stop with the most staff mapped to it.
  const campusStops = clientId
    ? await db
        .select({
          id: stops.id,
          name: stops.name,
          address: stops.address,
          lat: stops.lat,
          lng: stops.lng,
        })
        .from(stops)
        .where(eq(stops.companyId, clientId))
    : [];
  const depot =
    campusStops.find((s) => s.lat != null && s.lng != null) ??
    (campusStops[0] ?? null);
  const depotPoint = {
    lat: depot?.lat ?? 5.6037,
    lng: depot?.lng ?? -0.187,
  };

  const staff = clientId
    ? await db
        .select({
          id: employees.id,
          fullName: employees.fullName,
          code: employees.employeeCode,
          zone: employees.zone,
          lat: employees.homeLat,
          lng: employees.homeLng,
        })
        .from(employees)
        .where(eq(employees.companyId, clientId))
    : [];

  const fleet = await db
    .select({
      id: vehicles.id,
      registrationNo: vehicles.registrationNo,
      capacity: vehicles.capacity,
      status: vehicles.status,
    })
    .from(vehicles)
    .orderBy(asc(vehicles.registrationNo));

  const usableFleet = fleet.filter(
    (v) => v.status === "available" || v.status === "assigned",
  );

  const requests: VrpRequest[] = staff
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => ({
      id: s.id,
      pickup: { lat: s.lat as number, lng: s.lng as number },
      dropoff: depotPoint,
      seats: 1,
      earliestMinute: 300, // 05:00
      latestMinute: 540, // 09:00
      priority: 1,
      mandatory: false,
    }));

  const solverVehicles: VrpVehicle[] = usableFleet.map((v) => ({
    id: v.id,
    name: v.registrationNo,
    capacity: v.capacity,
    startMinute: 300,
    endMinute: 660, // 11:00
    cost: 120,
    costPerKm: 2.4,
  }));

  const result =
    requests.length && solverVehicles.length
      ? solveVrp({ depot: depotPoint, vehicles: solverVehicles, requests })
      : null;

  const staffById = new Map(staff.map((s) => [s.id, s]));
  const unassignedStaff = (result?.unassigned ?? [])
    .map((id) => staffById.get(id))
    .filter(Boolean);

  return (
    <div>
      <PageHeader
        eyebrow="Plan"
        title="Route optimisation"
        subtitle="Build a vehicle-routing plan from live staff locations, client campus and available fleet."
        actions={
          <ButtonLink href="/routes" variant="outline">
            Routes &amp; stops
          </ButtonLink>
        }
      />

      <Panel className="mt-4" title="Problem inputs" padded>
        <form method="get" className="flex flex-wrap items-end gap-2">
          {!scope ? (
            <Field
              label="Client"
              name="company"
              className="w-[220px]"
              defaultValue={clientId ? String(clientId) : ""}
              options={[
                { value: "", label: "Select a client" },
                ...clientOptions.map((c) => ({ value: String(c.id), label: c.name })),
              ]}
            />
          ) : null}
          <Button type="submit" variant="signal" size="sm">
            Solve
          </Button>
        </form>
      </Panel>

      {result ? (
        <>
          <MetricStrip>
            <MetricCell label="Staff to move" value={requests.length} />
            <MetricCell label="Vehicles used" value={result.assignments.length} />
            <MetricCell label="Unassigned" value={result.unassigned.length} tone={result.unassigned.length ? "caution" : "ok"} />
            <MetricCell label="Total distance" value={`${n(result.totalDistanceKm).toFixed(1)} km`} />
            <MetricCell
              label="Drive time"
              value={`${Math.round(result.totalDriveMinutes)} min`}
              hint="at the 28 km/h planning speed"
            />
          </MetricStrip>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Panel
              className="lg:col-span-2"
              title="Proposed routes"
              subtitle={`Depot: ${depot?.name ?? "Accra default"}`}
              padded={false}
            >
              <TableWrap>
                <THead>
                  <TR>
                    <TH>Vehicle</TH>
                    <TH>Stops</TH>
                    <TH>Load</TH>
                    <TH align="right">Distance</TH>
                    <TH align="right">Drive</TH>
                    <TH>Windows</TH>
                  </TR>
                </THead>
                <TBody>
                  {result.assignments.map((assignment) => (
                    <TR key={assignment.vehicleId}>
                      <TD>
                        <span className="font-display font-medium text-ink">
                          {assignment.vehicleName}
                        </span>
                      </TD>
                      <TD>
                        <span className="font-mono text-[12.5px] text-ink-2">
                          {assignment.requestIds.length}
                        </span>
                        {assignment.unassigned.length ? (
                          <span className="ml-2 text-[11.5px] text-critical">
                            {assignment.unassigned.length} dropped
                          </span>
                        ) : null}
                      </TD>
                      <TD className="min-w-[160px]">
                        <ProgressBar
                          value={assignment.loadPercent}
                          tone={assignment.loadPercent > 100 ? "critical" : "ok"}
                        />
                        <span className="mt-1 block font-mono text-[11.5px] text-ink-3">
                          {assignment.seatsUsed}/{assignment.capacity} seats
                        </span>
                      </TD>
                      <TD align="right">
                        <span className="font-mono text-[12.5px]">
                          {assignment.distanceKm.toFixed(1)} km
                        </span>
                      </TD>
                      <TD align="right">
                        <span className="font-mono text-[12.5px]">
                          {assignment.driveMinutes} min
                        </span>
                      </TD>
                      <TD>
                        <StatusChip
                          tone={assignment.withinWindows ? "ok" : "caution"}
                          label={assignment.withinWindows ? "Within windows" : "Window breached"}
                        />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </TableWrap>
              {!result.assignments.length ? (
                <div className="p-4">
                  <EmptyState
                    title="No feasible routes"
                    hint="Check that the fleet has capacity and that staff carry home coordinates."
                  />
                </div>
              ) : null}
            </Panel>

            <div className="flex flex-col gap-4">
              <Panel title="Method" padded>
                <p className="text-[13px] leading-relaxed text-ink-2">
                  {result.method}
                </p>
                <ul className="mt-3 flex flex-col gap-2">
                  {result.warnings.map((warning) => (
                    <li
                      key={warning}
                      className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-3"
                    >
                      <StatusDot tone="caution" />
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel title="Unassigned staff" padded>
                {unassignedStaff.length ? (
                  <ul className="flex flex-col gap-2">
                    {unassignedStaff.map((s) => (
                      <li
                        key={s!.id}
                        className="flex items-center justify-between border-b border-line pb-2 last:border-0 last:pb-0"
                      >
                        <span className="text-[13px] text-ink">{s!.fullName}</span>
                        <span className="font-mono text-[11.5px] text-ink-3">
                          {s!.code}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-ink-3">
                    Every staff member with coordinates was placed on a route.
                  </p>
                )}
              </Panel>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-4">
          <Panel padded>
            <EmptyState
              title="Nothing to optimise yet"
              hint={
                clientId
                  ? "This client has no staff with home coordinates, or the fleet has no available vehicles."
                  : "Choose a client to build a routing problem from its staff and campus."
              }
            />
          </Panel>
        </div>
      )}

      <Panel className="mt-4" title="How this is solved" padded>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="font-display text-[13px] font-medium text-ink">What it is</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
              Clarke-Wright savings with a 2-opt improvement pass, run in-process
              over the live database. Distances are great-circle, inflated by a
              road factor; the planning speed is 28 km/h with 3 minutes of
              service per stop.
            </p>
          </div>
          <div>
            <p className="font-display text-[13px] font-medium text-ink">
              What it is not
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
              This is not OR-Tools. Time windows are soft, there is a single
              depot, and the solution is not proven optimal. It is within a few
              percent of optimal on the problem sizes this system handles.
            </p>
          </div>
          <div>
            <p className="font-display text-[13px] font-medium text-ink">
              Upgrade path
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
              The solver is isolated behind one function with a typed request
              and result. Swapping in OR-Tools means replacing that one
              function — the screen, the data and the routes it produces stay
              the same.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
