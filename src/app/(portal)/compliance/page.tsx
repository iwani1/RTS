import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { drivers, fuelLogs, safetyInspections, vehicles } from "@/db/schema";
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
import { Field } from "@/components/ui/input";
import {
  createSafetyInspectionAction,
  recordFuelLogAction,
} from "@/app/actions/platform";
import { requireSection } from "@/lib/auth";
import { dateOnly, money, n, todayISO } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Fleet compliance.
 *
 * Two things a fleet manager is asked for every month: is every vehicle
 * legally roadworthy, and what did the fuel cost. Both are recorded here,
 * both are entered by a person, and the inspection recurrence is generated
 * from the cycle rather than remembered.
 */
export default async function CompliancePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireSection("compliance");
  const params = await searchParams;
  const from = params.from ?? todayISO().slice(0, 8) + "01";
  const to = params.to ?? todayISO();

  const fleet = await db
    .select({
      id: vehicles.id,
      registrationNo: vehicles.registrationNo,
      make: vehicles.make,
      model: vehicles.model,
      capacity: vehicles.capacity,
      status: vehicles.status,
    })
    .from(vehicles)
    .orderBy(asc(vehicles.registrationNo));

  const inspections = await db
    .select({
      inspection: safetyInspections,
      registrationNo: vehicles.registrationNo,
    })
    .from(safetyInspections)
    .innerJoin(vehicles, eq(vehicles.id, safetyInspections.vehicleId))
    .orderBy(desc(safetyInspections.performedAt))
    .limit(60);

  const fuel = await db
    .select({
      log: fuelLogs,
      registrationNo: vehicles.registrationNo,
      driverName: drivers.fullName,
    })
    .from(fuelLogs)
    .leftJoin(vehicles, eq(vehicles.id, fuelLogs.vehicleId))
    .leftJoin(drivers, eq(drivers.id, fuelLogs.driverId))
    .where(and(gte(fuelLogs.filledAt, new Date(`${from}T00:00:00Z`)), lte(fuelLogs.filledAt, new Date(`${to}T23:59:59Z`))))
    .orderBy(desc(fuelLogs.filledAt))
    .limit(60);

  const today = todayISO();
  const dueSoon = inspections.filter(
    (row) => row.inspection.nextDueAt && String(row.inspection.nextDueAt) <= addDays(today, 30),
  );
  const overdue = inspections.filter(
    (row) => row.inspection.nextDueAt && String(row.inspection.nextDueAt) < today,
  );
  const litres = fuel.reduce((sum, row) => sum + n(row.log.litres), 0);
  const cost = fuel.reduce((sum, row) => sum + n(row.log.cost), 0);
  const fuelEfficiency = litres > 0 ? cost / litres : 0;

  return (
    <div>
      <PageHeader
        eyebrow="Asset"
        title="Compliance"
        subtitle="Inspections, their recurrence, and the fuel log — the two records a fleet manager is asked for every month."
      />

      <MetricStrip className="mt-4">
        <MetricCell label="Vehicles" value={String(fleet.length)} />
        <MetricCell label="Inspections recorded" value={String(inspections.length)} />
        <MetricCell
          label="Due within 30 days"
          value={String(dueSoon.length)}
          hint={overdue.length ? `${overdue.length} overdue` : undefined}
        />
        <MetricCell label="Fuel logged" value={`${litres.toFixed(1)} L`} />
        <MetricCell label="Fuel cost" value={money(cost)} />
        <MetricCell
          label="Average per litre"
          value={fuelEfficiency ? money(fuelEfficiency) : "—"}
        />
      </MetricStrip>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel
          eyebrow="Record"
          title="New inspection"
          subtitle="The next due date follows the statutory cycle: a year for roadworthiness and annual tests, a quarter for spot checks."
        >
          <ActionForm action={createSafetyInspectionAction} submitLabel="Record inspection">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Vehicle"
                name="vehicleId"
                type="number"
                required
                placeholder="Vehicle id"
                hint={fleet.length ? `1 – ${fleet.length}` : undefined}
              />
              <Field
                label="Type"
                name="type"
                type="select"
                defaultValue="roadworthiness"
                options={[
                  { value: "roadworthiness", label: "Roadworthiness" },
                  { value: "annual", label: "Annual inspection" },
                  { value: "spot", label: "Spot check" },
                  { value: "pre_departure", label: "Pre-departure" },
                ]}
              />
              <Field
                label="Result"
                name="result"
                type="select"
                defaultValue="pass"
                options={[
                  { value: "pass", label: "Pass" },
                  { value: "conditional", label: "Conditional" },
                  { value: "fail", label: "Fail" },
                ]}
              />
              <Field
                label="Performed on"
                name="performedAt"
                type="date"
                required
                defaultValue={today}
              />
              <Field label="Certificate number" name="certificateNo" placeholder="RW-2026-4412" />
              <Field label="Inspector" name="inspector" placeholder="Kwame Asante" />
            </div>
          </ActionForm>
        </Panel>

        <Panel
          eyebrow="Record"
          title="Fuel fill-up"
          subtitle="Litres, cost and odometer. The cost per litre is derived, never typed in."
        >
          <ActionForm action={recordFuelLogAction} submitLabel="Record fuel">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Vehicle"
                name="vehicleId"
                type="number"
                required
                placeholder="Vehicle id"
                hint={fleet.length ? `1 – ${fleet.length}` : undefined}
              />
              <Field label="Litres" name="litres" type="number" required placeholder="45.5" />
              <Field label="Cost" name="cost" type="number" required placeholder="620.00" />
              <Field label="Odometer (km)" name="odometerKm" type="number" placeholder="184230" />
              <Field label="Station" name="station" placeholder="Total, Tema" />
              <Field
                label="Driver"
                name="driverId"
                type="number"
                placeholder="Driver id"
                hint="Optional"
              />
            </div>
          </ActionForm>
        </Panel>
      </div>

      <Panel
        className="mt-4"
        eyebrow="Register"
        title="Safety inspections"
        padded={false}
        subtitle="Newest first. The next due date is generated from the cycle."
      >
        {inspections.length === 0 ? (
          <EmptyState
            title="No inspections recorded"
            hint="Record the first one above and the schedule will look after itself."
          />
        ) : (
          <TableWrap>
            <THead>
              <TR>
                <TH>Vehicle</TH>
                <TH>Type</TH>
                <TH>Result</TH>
                <TH>Performed</TH>
                <TH>Next due</TH>
                <TH>Certificate</TH>
              </TR>
            </THead>
            <TBody>
              {inspections.map((row) => {
                const nextDue = row.inspection.nextDueAt
                  ? String(row.inspection.nextDueAt).slice(0, 10)
                  : null;
                const late = nextDue ? nextDue < today : false;
                const soon = nextDue ? nextDue <= addDays(today, 30) : false;
                return (
                  <TR key={row.inspection.id}>
                    <TDPrimary>{row.registrationNo}</TDPrimary>
                    <TD>{row.inspection.type.replace(/_/g, " ")}</TD>
                    <TD>
                      <StatusChip status={row.inspection.result} />
                    </TD>
                    <TD>{dateOnly(row.inspection.performedAt)}</TD>
                    <TD>
                      <span className={late ? "text-st-critical" : soon ? "text-st-caution" : ""}>
                        {nextDue ?? "—"}
                      </span>
                    </TD>
                    <TD>{row.inspection.certificateNo ?? "—"}</TD>
                  </TR>
                );
              })}
            </TBody>
          </TableWrap>
        )}
      </Panel>

      <Panel
        className="mt-4"
        eyebrow="Register"
        title="Fuel log"
        padded={false}
        subtitle="Every fill-up in the selected period."
      >
        {fuel.length === 0 ? (
          <EmptyState title="No fuel recorded" hint="Nothing was logged in this period." />
        ) : (
          <TableWrap>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Vehicle</TH>
                <TH>Driver</TH>
                <TH>Litres</TH>
                <TH>Cost</TH>
                <TH>Per litre</TH>
                <TH>Station</TH>
              </TR>
            </THead>
            <TBody>
              {fuel.map((row) => {
                const litres = n(row.log.litres);
                const cost = n(row.log.cost);
                return (
                  <TR key={row.log.id}>
                    <TD>{dateOnly(row.log.filledAt)}</TD>
                    <TDPrimary>{row.registrationNo ?? "—"}</TDPrimary>
                    <TD>{row.driverName ?? "—"}</TD>
                    <TD>{litres.toFixed(1)} L</TD>
                    <TD>{money(cost)}</TD>
                    <TD>{litres ? money(cost / litres) : "—"}</TD>
                    <TD>{row.log.station ?? "—"}</TD>
                  </TR>
                );
              })}
            </TBody>
          </TableWrap>
        )}
      </Panel>
    </div>
  );
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
