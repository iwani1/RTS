import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, maintenanceRecords, vehicles } from "@/db/schema";
import { ActionForm, InlineActionForm } from "@/components/action-form";
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
import { Checkbox } from "@/components/ui/input";
import { Field } from "@/components/ui/input";
import {
  createVehicleAction,
  scheduleMaintenanceAction,
  updateVehicleAction,
} from "@/app/actions/admin";
import { requireSection } from "@/lib/auth";
import { getDocumentExpiries, getMaintenanceDue } from "@/lib/queries";
import { dateOnly, isoDaysFromNow, money, n, todayISO } from "@/lib/utils";

export const dynamic = "force-dynamic";

const VEHICLE_STATUS = [
  "available",
  "assigned",
  "on_trip",
  "under_maintenance",
  "out_of_service",
];

export default async function FleetPage() {
  await requireSection("fleet");

  const rows = await db
    .select({
      vehicle: vehicles,
      company: companies.name,
      trips: sql<number>`(select count(*) from trips t where t.vehicle_id = ${vehicles.id})`,
      completed: sql<number>`(select count(*) from trips t where t.vehicle_id = ${vehicles.id} and t.status = 'completed')`,
      maintenanceCost: sql<string>`(select coalesce(sum(m.cost), 0) from maintenance_records m where m.vehicle_id = ${vehicles.id})`,
    })
    .from(vehicles)
    .leftJoin(companies, eq(companies.id, vehicles.assignedCompanyId))
    .orderBy(asc(vehicles.registrationNo));

  const maintenance = await db
    .select({ record: maintenanceRecords, vehicle: vehicles.registrationNo })
    .from(maintenanceRecords)
    .innerJoin(vehicles, eq(vehicles.id, maintenanceRecords.vehicleId))
    .orderBy(desc(maintenanceRecords.serviceDate))
    .limit(10);

  const [{ vehicleDocs }, due] = await Promise.all([
    getDocumentExpiries(60),
    getMaintenanceDue(),
  ]);
  const companyOptions = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies);

  const available = rows.filter((r) => r.vehicle.status === "available").length;
  const offline = rows.filter((r) =>
    ["under_maintenance", "out_of_service"].includes(r.vehicle.status),
  ).length;
  const utilisation = rows.length
    ? (rows.filter((r) => ["assigned", "on_trip"].includes(r.vehicle.status)).length /
        rows.length) *
      100
    : 0;

  return (
    <div>
      <PageHeader
        eyebrow="Assets"
        title="Fleet management"
        subtitle="Vehicles, documents, availability, maintenance and utilisation."
      />

      <MetricStrip>
        <MetricCell label="Vehicles" value={rows.length} hint={`${available} available now`} />
        <MetricCell
          label="Fleet utilisation"
          value={`${utilisation.toFixed(0)}%`}
          tone={utilisation >= 60 ? "ok" : "caution"}
        />
        <MetricCell
          label="Offline"
          value={offline}
          tone={offline ? "caution" : "ok"}
          hint="Maintenance or out of service"
        />
        <MetricCell
          label="Document alerts (60d)"
          value={vehicleDocs.length}
          tone={vehicleDocs.length ? "critical" : "ok"}
        />
      </MetricStrip>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Vehicle register"
          subtitle={`${rows.length} vehicles`}
          padded={false}
        >
          <TableWrap>
            <THead>
              <TR>
                <TH>Vehicle</TH>
                <TH>Type</TH>
                <TH align="right">Seats</TH>
                <TH>Assigned client</TH>
                <TH>Documents</TH>
                <TH align="right">Trips</TH>
                <TH>Status</TH>
                <TH align="right" />
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => {
                const expiring = [
                  r.vehicle.insuranceExpiry,
                  r.vehicle.roadworthinessExpiry,
                  r.vehicle.registrationExpiry,
                ]
                  .filter((d) => d && d <= isoDaysFromNow(45))
                  .map((d) => dateOnly(d));
                return (
                  <TR key={r.vehicle.id}>
                    <TDPrimary>
                      {r.vehicle.registrationNo}
                      <p className="mt-0.5 text-[11px] font-normal text-ink-3">
                        {r.vehicle.make} {r.vehicle.model}
                        {r.vehicle.year ? ` · ${r.vehicle.year}` : ""}
                      </p>
                      <p className="text-[11px] font-normal text-ink-3">
                        {n(r.vehicle.odometerKm).toLocaleString()} km ·{" "}
                        {n(r.vehicle.avgKmPerLitre)} km/L
                      </p>
                    </TDPrimary>
                    <TD>
                      <span className="capitalize">{r.vehicle.vehicleType}</span>
                      <p className="mt-0.5 text-[11px] capitalize text-ink-3">
                        {r.vehicle.fuelType} · {r.vehicle.ownership}
                      </p>
                    </TD>
                    <TD align="right">{r.vehicle.capacity}</TD>
                    <TD>{r.company ?? "Shared fleet"}</TD>
                    <TD>
                      <p className="numeric text-[12px]">
                        Ins {dateOnly(r.vehicle.insuranceExpiry)}
                      </p>
                      <p className="numeric text-[11px] text-ink-3">
                        Road {dateOnly(r.vehicle.roadworthinessExpiry)}
                      </p>
                      {expiring.length ? (
                        <p className="text-[11px] text-st-caution">
                          {expiring.length} expiring soon
                        </p>
                      ) : null}
                    </TD>
                    <TD align="right">
                      {Number(r.completed)}/{Number(r.trips)}
                      <p className="mt-0.5 text-[11px] text-ink-3">
                        {money(r.maintenanceCost)}
                      </p>
                    </TD>
                    <TD>
                      <StatusChip status={r.vehicle.status} />
                    </TD>
                    <TD align="right">
                      <InlineActionForm
                        action={updateVehicleAction}
                        hiddenFields={{ id: r.vehicle.id }}
                        submitLabel="Update"
                        variant="ghost"
                      />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </TableWrap>
          {!rows.length ? (
            <div className="p-4">
              <EmptyState title="No vehicles registered" />
            </div>
          ) : null}
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Add a vehicle">
            <ActionForm
              action={createVehicleAction}
              submitLabel="Add vehicle"
              resetOnSuccess
            >
              <div className="flex flex-col gap-3">
                <Field
                  label="Registration number"
                  name="registrationNo"
                  required
                  placeholder="GR-1234-25"
                />
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Make" name="make" required placeholder="Toyota" />
                  <Field label="Model" name="model" placeholder="Hiace" />
                  <Field label="Year" name="year" type="number" placeholder="2024" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Field
                    label="Seats"
                    name="capacity"
                    type="number"
                    required
                    defaultValue={14}
                  />
                  <Field
                    label="Type"
                    name="vehicleType"
                    options={["sedan", "suv", "minibus", "van", "bus"].map((v) => ({
                      value: v,
                      label: v,
                    }))}
                  />
                  <Field
                    label="Fuel"
                    name="fuelType"
                    options={[
                      "diesel",
                      "petrol",
                      "electric",
                      "hybrid",
                      "cng",
                    ].map((v) => ({ value: v, label: v }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="Ownership"
                    name="ownership"
                    options={["owned", "leased", "contracted"].map((v) => ({
                      value: v,
                      label: v,
                    }))}
                  />
                  <Field
                    label="Cost per km (GHS)"
                    name="costPerKm"
                    type="number"
                    step="0.01"
                    defaultValue={0.9}
                  />
                </div>
                <Field
                  label="Assigned client"
                  name="assignedCompanyId"
                  options={[
                    { value: "", label: "Shared fleet" },
                    ...companyOptions.map((c) => ({
                      value: String(c.id),
                      label: c.name,
                    })),
                  ]}
                />
                <div className="grid grid-cols-3 gap-2">
                  <Field
                    label="Insurance expiry"
                    name="insuranceExpiry"
                    type="date"
                  />
                  <Field
                    label="Roadworthiness"
                    name="roadworthinessExpiry"
                    type="date"
                  />
                  <Field
                    label="Registration"
                    name="registrationExpiry"
                    type="date"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="Odometer (km)"
                    name="odometerKm"
                    type="number"
                  />
                  <Field
                    label="Avg km / litre"
                    name="avgKmPerLitre"
                    type="number"
                    step="0.1"
                  />
                </div>
              </div>
            </ActionForm>
          </Panel>

          <Panel title="Update vehicle status &amp; documents">
            <ActionForm action={updateVehicleAction} submitLabel="Save changes">
              <div className="flex flex-col gap-3">
                <Field
                  label="Vehicle"
                  name="id"
                  required
                  options={rows.map((r) => ({
                    value: String(r.vehicle.id),
                    label: `${r.vehicle.registrationNo} · ${r.vehicle.make} ${r.vehicle.model}`,
                  }))}
                />
                <Field
                  label="Status"
                  name="status"
                  options={VEHICLE_STATUS.map((s) => ({
                    value: s,
                    label: s.replace(/_/g, " "),
                  }))}
                />
                <div className="grid grid-cols-3 gap-2">
                  <Field
                    label="Insurance expiry"
                    name="insuranceExpiry"
                    type="date"
                  />
                  <Field
                    label="Roadworthiness"
                    name="roadworthinessExpiry"
                    type="date"
                  />
                  <Field
                    label="Registration"
                    name="registrationExpiry"
                    type="date"
                  />
                </div>
                <Field label="Odometer (km)" name="odometerKm" type="number" />
                <Field
                  label="Assigned client"
                  name="assignedCompanyId"
                  options={[
                    { value: "", label: "Shared fleet" },
                    ...companyOptions.map((c) => ({
                      value: String(c.id),
                      label: c.name,
                    })),
                  ]}
                />
                <Field label="Notes" name="notes" type="textarea" />
              </div>
            </ActionForm>
            <p className="mt-3 text-[11.5px] text-ink-3">
              Vehicles under maintenance or out of service are blocked from trip
              assignment.
            </p>
          </Panel>

          <Panel
            title="Log maintenance"
            subtitle="Preventive service, repairs and inspections"
          >
            <ActionForm
              action={scheduleMaintenanceAction}
              submitLabel="Log maintenance"
              resetOnSuccess
            >
              <div className="flex flex-col gap-3">
                <Field
                  label="Vehicle"
                  name="vehicleId"
                  required
                  options={rows.map((r) => ({
                    value: String(r.vehicle.id),
                    label: r.vehicle.registrationNo,
                  }))}
                />
                <Field
                  label="Type"
                  name="type"
                  options={[
                    { value: "preventive", label: "Preventive service" },
                    { value: "repair", label: "Repair" },
                    { value: "inspection", label: "Safety inspection" },
                  ]}
                />
                <Field
                  label="Description"
                  name="description"
                  required
                  type="textarea"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="Service date"
                    name="serviceDate"
                    type="date"
                    required
                    defaultValue={todayISO()}
                  />
                  <Field
                    label="Next service due"
                    name="nextServiceDate"
                    type="date"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Cost (GHS)" name="cost" type="number" step="0.01" />
                  <Field label="Odometer" name="odometerKm" type="number" />
                  <Field label="Garage" name="garageName" />
                </div>
                <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
                  <Checkbox name="takeOffline" />
                  Take vehicle offline for this work
                </label>
              </div>
            </ActionForm>
          </Panel>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Maintenance history" padded={false}>
          <TableWrap>
            <THead>
              <TR>
                <TH>Vehicle</TH>
                <TH>Type</TH>
                <TH>Description</TH>
                <TH align="right">Cost</TH>
                <TH>Service date</TH>
                <TH>Next due</TH>
              </TR>
            </THead>
            <TBody>
              {maintenance.map((m) => (
                <TR key={m.record.id}>
                  <TDPrimary>{m.vehicle}</TDPrimary>
                  <TD>
                    <span className="capitalize">{m.record.type}</span>
                  </TD>
                  <TD>{m.record.description}</TD>
                  <TD align="right">{money(m.record.cost)}</TD>
                  <TD className="numeric">{dateOnly(m.record.serviceDate)}</TD>
                  <TD className="numeric">{dateOnly(m.record.nextServiceDate)}</TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          {!maintenance.length ? (
            <div className="p-4">
              <EmptyState title="No maintenance records" />
            </div>
          ) : null}
        </Panel>

        <Panel title="Service &amp; document reminders">
          <ul className="flex flex-col gap-2">
            {due.slice(0, 6).map((v) => (
              <li key={v.id} className="rounded-[8px] border border-line px-3 py-2.5">
                <p className="font-display text-[12.5px] font-medium text-ink">
                  {v.registrationNo} · {v.model}
                </p>
                <p className="mt-0.5 text-[11.5px] text-ink-2">
                  Odometer {n(v.odometerKm).toLocaleString()} km · last service{" "}
                  {v.lastService ? dateOnly(v.lastService) : "never"}
                </p>
                <div className="mt-2">
                  <ProgressBar
                    value={Math.min(100, (n(v.odometerKm) / 300000) * 100)}
                    tone="caution"
                  />
                </div>
              </li>
            ))}
            {vehicleDocs.slice(0, 4).map((v) => (
              <li
                key={`d${v.id}`}
                className="rounded-[8px] border border-st-caution/30 bg-st-caution/10 px-3 py-2.5 text-st-caution"
              >
                <span className="font-semibold">{v.label}</span> — insurance{" "}
                {dateOnly(v.insurance)}, roadworthiness {dateOnly(v.roadworthy)}
              </li>
            ))}
            {!due.length && !vehicleDocs.length ? (
              <li className="text-[12px] text-ink-3">
                Nothing due. Every vehicle is inside its service and document
                window.
              </li>
            ) : null}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
