import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { companies, drivers, incidents, trips, users, vehicles } from "@/db/schema";
import { ActionForm, InlineActionForm } from "@/components/action-form";
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
import { createIncidentAction, updateIncidentAction } from "@/app/actions/ops";
import { companyScope, requireSection } from "@/lib/auth";
import { getDocumentExpiries } from "@/lib/queries";
import { dateOnly, humanize } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function IncidentsPage() {
  const user = await requireSection("incidents");
  const scope = companyScope(user);

  const rows = await db
    .select({
      incident: incidents,
      company: companies.name,
      vehicle: vehicles.registrationNo,
      driver: drivers.fullName,
      tripRef: trips.reference,
      reporter: users.fullName,
    })
    .from(incidents)
    .leftJoin(companies, eq(companies.id, incidents.companyId))
    .leftJoin(vehicles, eq(vehicles.id, incidents.vehicleId))
    .leftJoin(drivers, eq(drivers.id, incidents.driverId))
    .leftJoin(trips, eq(trips.id, incidents.tripId))
    .leftJoin(users, eq(users.id, incidents.reportedById))
    .where(scope ? eq(incidents.companyId, scope) : undefined)
    .orderBy(desc(incidents.reportedAt))
    .limit(60);

  const { vehicleDocs, driverDocs } = await getDocumentExpiries(60);
  const open = rows.filter((r) => r.incident.status !== "resolved");
  const critical = rows.filter(
    (r) =>
      r.incident.severity === "critical" || r.incident.severity === "high",
  );

  const activeTrips = await db
    .select({ id: trips.id, reference: trips.reference })
    .from(trips)
    .where(
      inArray(trips.status, [
        "scheduled",
        "dispatching",
        "in_progress",
        "delayed",
        "breakdown",
      ]),
    )
    .limit(30);
  const vehicleOptions = await db
    .select({ id: vehicles.id, registrationNo: vehicles.registrationNo })
    .from(vehicles);
  const companyOptions = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies);

  return (
    <div>
      <PageHeader
        eyebrow="Governance"
        title="Safety &amp; compliance"
        subtitle="Incidents, breakdowns, SOS reports, no-shows, document expiries and safety inspections."
      />

      <MetricStrip>
        <MetricCell
          label="Open incidents"
          value={open.length}
          tone={open.length ? "caution" : "ok"}
        />
        <MetricCell
          label="High / critical"
          value={critical.length}
          tone={critical.length ? "critical" : "ok"}
        />
        <MetricCell
          label="Vehicle document alerts"
          value={vehicleDocs.length}
          tone={vehicleDocs.length ? "caution" : "ok"}
        />
        <MetricCell
          label="Licence alerts"
          value={driverDocs.length}
          tone={driverDocs.length ? "caution" : "ok"}
        />
      </MetricStrip>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Incident register"
          subtitle={`${rows.length} recorded`}
          padded={false}
        >
          <TableWrap>
            <THead>
              <TR>
                <TH>Reported</TH>
                <TH>Type</TH>
                <TH>Severity</TH>
                <TH>Client / vehicle</TH>
                <TH>Description</TH>
                <TH>Status</TH>
                <TH align="right" />
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.incident.id}>
                  <TD className="numeric text-[12px]">
                    {dateOnly(r.incident.reportedAt)}
                  </TD>
                  <TDPrimary>{humanize(r.incident.type)}</TDPrimary>
                  <TD>
                    <StatusChip status={r.incident.severity} />
                  </TD>
                  <TD>
                    {r.company ?? "Platform"}
                    <p className="mt-0.5 text-[11px] text-ink-3">
                      {r.vehicle ?? "—"}
                      {r.tripRef ? ` · ${r.tripRef}` : ""}
                    </p>
                    <p className="text-[11px] text-ink-3">{r.driver ?? "—"}</p>
                  </TD>
                  <TD>
                    <span className="line-clamp-2 text-[12px]">
                      {r.incident.description}
                    </span>
                    <p className="mt-0.5 text-[11px] text-ink-3">
                      {r.incident.actionTaken ?? "Awaiting action"}
                    </p>
                    <p className="text-[11px] text-ink-3">
                      Reported by {r.reporter ?? "system"}
                    </p>
                  </TD>
                  <TD>
                    <StatusChip status={r.incident.status} />
                  </TD>
                  <TD align="right">
                    {r.incident.status !== "resolved" ? (
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <InlineActionForm
                          action={updateIncidentAction}
                          hiddenFields={{
                            id: r.incident.id,
                            status: "acknowledged",
                          }}
                          submitLabel="Ack"
                          variant="ghost"
                        />
                        <InlineActionForm
                          action={updateIncidentAction}
                          hiddenFields={{ id: r.incident.id, status: "resolved" }}
                          submitLabel="Resolve"
                        />
                      </div>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          {!rows.length ? (
            <div className="p-4">
              <EmptyState title="No incidents recorded" />
            </div>
          ) : null}
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel
            title="Report an incident"
            subtitle="Driver SOS, breakdown, accident or safety concern"
          >
            <ActionForm
              action={createIncidentAction}
              submitLabel="Submit report"
              resetOnSuccess
            >
              <div className="flex flex-col gap-3">
                <Field
                  label="Type"
                  name="type"
                  options={[
                    "breakdown",
                    "accident",
                    "sos",
                    "missed_pickup",
                    "delay",
                    "no_show",
                    "complaint",
                    "safety",
                  ].map((t) => ({ value: t, label: humanize(t) }))}
                />
                <Field
                  label="Severity"
                  name="severity"
                  options={["low", "medium", "high", "critical"].map((s) => ({
                    value: s,
                    label: s,
                  }))}
                />
                {!scope ? (
                  <Field
                    label="Client"
                    name="companyId"
                    options={[
                      { value: "", label: "Platform / internal" },
                      ...companyOptions.map((c) => ({
                        value: String(c.id),
                        label: c.name,
                      })),
                    ]}
                  />
                ) : null}
                <Field
                  label="Trip"
                  name="tripId"
                  options={[
                    { value: "", label: "—" },
                    ...activeTrips.map((t) => ({
                      value: String(t.id),
                      label: t.reference,
                    })),
                  ]}
                />
                <Field
                  label="Vehicle"
                  name="vehicleId"
                  options={[
                    { value: "", label: "—" },
                    ...vehicleOptions.map((v) => ({
                      value: String(v.id),
                      label: v.registrationNo,
                    })),
                  ]}
                />
                <Field
                  label="Location"
                  name="location"
                  placeholder="Spintex Road, Accra"
                />
                <Field
                  label="What happened?"
                  name="description"
                  type="textarea"
                  required
                />
              </div>
            </ActionForm>
          </Panel>

          <Panel title="Close an incident">
            <ActionForm action={updateIncidentAction} submitLabel="Update incident">
              <div className="flex flex-col gap-3">
                <Field
                  label="Incident"
                  name="id"
                  required
                  options={rows.map((r) => ({
                    value: String(r.incident.id),
                    label: `#${r.incident.id} · ${humanize(r.incident.type)} · ${r.company ?? "Platform"}`,
                  }))}
                />
                <Field
                  label="Status"
                  name="status"
                  options={[
                    { value: "acknowledged", label: "Acknowledged" },
                    { value: "resolved", label: "Resolved" },
                  ]}
                />
                <Field label="Action taken" name="actionTaken" type="textarea" />
              </div>
            </ActionForm>
          </Panel>

          <Panel title="Document expiry watchlist" padded={false}>
            <ul className="divide-y divide-line">
              {vehicleDocs.slice(0, 6).map((v) => (
                <li key={`v${v.id}`} className="px-3.5 py-2.5">
                  <span className="text-[12.5px] font-medium text-ink">{v.label}</span>
                  <p className="numeric mt-0.5 text-[11px] text-ink-2">
                    Insurance {dateOnly(v.insurance)} · Roadworthiness{" "}
                    {dateOnly(v.roadworthy)} · Registration {dateOnly(v.registration)}
                  </p>
                </li>
              ))}
              {driverDocs.slice(0, 6).map((d) => (
                <li key={`d${d.id}`} className="px-3.5 py-2.5">
                  <span className="text-[12.5px] font-medium text-ink">{d.label}</span>
                  <p className="numeric mt-0.5 text-[11px] text-ink-2">
                    Licence expires {dateOnly(d.license)}
                  </p>
                </li>
              ))}
              {!vehicleDocs.length && !driverDocs.length ? (
                <li className="px-3.5 py-3 text-[12px] text-ink-3">
                  All documents are valid for the next 60 days.
                </li>
              ) : null}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
