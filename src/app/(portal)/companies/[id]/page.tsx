import Link from "next/link";
import { notFound } from "next/navigation";
import { count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  branches,
  companies,
  employees,
  invoices,
  routes,
  serviceAgreements,
  shifts,
  trips,
} from "@/db/schema";
import { ActionForm } from "@/components/action-form";
import {
  ButtonLink,
  Checkbox,
  DefinitionList,
  EmptyState,
  Field,
  MetricCell,
  MetricStrip,
  PageHeader,
  Panel,
  StatusChip,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui";
import {
  createAgreementAction,
  createBranchAction,
  updateCompanyAction,
} from "@/app/actions/admin";
import { requireSection } from "@/lib/auth";
import { dateOnly, humanize, money, n } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSection("companies");
  const { id } = await params;
  const companyId = Number(id);
  if (!Number.isFinite(companyId)) notFound();

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!company) notFound();

  const [
    branchRows,
    agreementRows,
    shiftRows,
    routeRows,
    invoiceRows,
    employeeStats,
    tripStats,
  ] = await Promise.all([
    db.select().from(branches).where(eq(branches.companyId, companyId)),
    db
      .select()
      .from(serviceAgreements)
      .where(eq(serviceAgreements.companyId, companyId))
      .orderBy(desc(serviceAgreements.id)),
    db.select().from(shifts).where(eq(shifts.companyId, companyId)),
    db.select().from(routes).where(eq(routes.companyId, companyId)),
    db
      .select()
      .from(invoices)
      .where(eq(invoices.companyId, companyId))
      .orderBy(desc(invoices.issuedAt)),
    db
      .select({
        total: count(),
        active: sql<number>`sum(case when ${employees.active} then 1 else 0 end)`,
        vip: sql<number>`sum(case when ${employees.vip} then 1 else 0 end)`,
        linked: sql<number>`sum(case when ${employees.userId} is not null then 1 else 0 end)`,
      })
      .from(employees)
      .where(eq(employees.companyId, companyId)),
    db
      .select({
        total: count(),
        completed: sql<number>`sum(case when ${trips.status} = 'completed' then 1 else 0 end)`,
        passengers: sql<number>`coalesce(sum(${trips.bookedSeats}), 0)`,
        km: sql<number>`coalesce(sum(${trips.plannedKm}), 0)`,
      })
      .from(trips)
      .where(eq(trips.companyId, companyId)),
  ]);

  const [bookingStats] = await db
    .select({
      total: count(),
      cancelled: sql<number>`sum(case when ${bookings.status} = 'cancelled' then 1 else 0 end)`,
      noShow: sql<number>`sum(case when ${bookings.status} = 'no_show' then 1 else 0 end)`,
    })
    .from(bookings)
    .where(eq(bookings.companyId, companyId));

  const invoiced = invoiceRows.reduce((s, i) => s + n(i.total), 0);
  const collected = invoiceRows.reduce((s, i) => s + n(i.amountPaid), 0);
  const outstanding = invoiced - collected;

  return (
    <div>
      <PageHeader
        eyebrow="Clients"
        title={company.name}
        subtitle={`${company.industry ?? "Corporate client"} · ${
          company.city ?? "Ghana"
        } · billing ${company.billingModel.replace(/_/g, " ")}`}
        actions={
          <>
            <ButtonLink href="/companies" variant="outline">
              All clients
            </ButtonLink>
            <ButtonLink href="/employees" variant="signal">
              Manage employees
            </ButtonLink>
          </>
        }
      />

      <MetricStrip>
        <MetricCell
          label="Employees"
          value={n(Number(employeeStats[0]?.total ?? 0))}
          hint={`${n(Number(employeeStats[0]?.linked ?? 0))} portal accounts linked`}
        />
        <MetricCell
          label="Trips operated"
          value={n(Number(tripStats[0]?.total ?? 0))}
          hint={`${n(Number(tripStats[0]?.completed ?? 0))} completed`}
        />
        <MetricCell
          label="Passengers carried"
          value={n(Number(tripStats[0]?.passengers ?? 0))}
          hint={`${n(tripStats[0]?.km).toFixed(0)} km planned`}
        />
        <MetricCell
          label="Outstanding balance"
          value={money(outstanding)}
          tone={outstanding > 0 ? "caution" : "ok"}
        />
      </MetricStrip>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Client profile" eyebrow="Account">
          <DefinitionList
            items={[
              { label: "Primary contact", value: company.contactPerson ?? "—" },
              { label: "Email", value: company.email ?? "—" },
              { label: "Phone", value: company.phone ?? "—" },
              { label: "Status", value: <StatusChip status={company.status} /> },
              { label: "Billing model", value: company.billingModel.replace(/_/g, " ") },
              { label: "Monthly rate", value: money(company.monthlyRate) },
              {
                label: "Bookings",
                value: `${n(Number(bookingStats?.total ?? 0))} (${n(
                  Number(bookingStats?.cancelled ?? 0),
                )} cancelled, ${n(Number(bookingStats?.noShow ?? 0))} no-shows)`,
              },
              { label: "Registered", value: dateOnly(company.createdAt) },
            ]}
          />
          <div className="mt-4 border-t border-line pt-4">
            <p className="eyebrow mb-2">Update client</p>
            <ActionForm action={updateCompanyAction} submitLabel="Save changes">
              <input type="hidden" name="id" value={company.id} />
              <div className="space-y-3">
                <Field
                  label="Status"
                  name="status"
                  options={[
                    { value: company.status, label: `Keep: ${company.status}` },
                    { value: "active", label: "Active" },
                    { value: "suspended", label: "Suspended" },
                    { value: "inactive", label: "Inactive" },
                  ]}
                />
                <Field
                  label="Billing model"
                  name="billingModel"
                  options={[
                    {
                      value: company.billingModel,
                      label: `Keep: ${company.billingModel}`,
                    },
                    ...["per_passenger", "per_trip", "monthly_fixed", "distance_based"].map((v) => ({
                      value: v,
                      label: v.replace(/_/g, " "),
                    })),
                  ]}
                />
                <Field
                  label="Monthly rate (GHS)"
                  name="monthlyRate"
                  type="number"
                  step="0.01"
                  defaultValue={company.monthlyRate}
                />
                <Field label="Internal notes" name="notes" rows={3} defaultValue={company.notes} />
              </div>
            </ActionForm>
          </div>
        </Panel>

        <Panel title="Office locations & branches" eyebrow="Network" padded={false}>
          <div className="divide-y divide-line">
            {branchRows.map((b) => (
              <div key={b.id} className="px-4 py-3">
                <p className="text-[13px] font-medium text-ink">
                  {b.name}
                  {b.isHeadquarters ? (
                    <span className="ml-1.5 text-[11px] text-signal-text">HQ</span>
                  ) : null}
                </p>
                <p className="text-[12.5px] text-ink-2">{b.address ?? "—"}</p>
                <p className="numeric text-[11.5px] text-ink-3">
                  {b.lat ?? "—"}, {b.lng ?? "—"}
                </p>
              </div>
            ))}
            {!branchRows.length ? (
              <div className="p-4">
                <EmptyState title="No branches" />
              </div>
            ) : null}
          </div>
          <div className="border-t border-line p-4">
            <p className="eyebrow mb-2">Add a branch</p>
            <ActionForm action={createBranchAction} submitLabel="Add branch">
              <input type="hidden" name="companyId" value={company.id} />
              <div className="space-y-3">
                <Field label="Branch name" name="name" required />
                <Field label="Address" name="address" />
                <div className="grid grid-cols-3 gap-2">
                  <Field label="City" name="city" />
                  <Field
                    label="Latitude"
                    name="lat"
                    type="number"
                    step="0.0001"
                    placeholder="5.6037"
                  />
                  <Field
                    label="Longitude"
                    name="lng"
                    type="number"
                    step="0.0001"
                    placeholder="-0.1870"
                  />
                </div>
                <label className="flex items-center gap-2 text-[12px] text-ink-2">
                  <Checkbox name="isHeadquarters" id="isHeadquarters" />
                  Set as headquarters
                </label>
              </div>
            </ActionForm>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel
            title="Service agreements & SLAs"
            eyebrow="Contract"
            padded={false}
          >
            <div className="divide-y divide-line">
              {agreementRows.map((a) => (
                <div key={a.id} className="px-4 py-3">
                  <p className="text-[13px] font-medium text-ink">{a.name}</p>
                  <p className="text-[12px] text-ink-2">
                    {a.pricingModel.replace(/_/g, " ")} · unit rate {money(a.unitRate)} ·{" "}
                    {dateOnly(a.startDate)} → {a.endDate ? dateOnly(a.endDate) : "open"}
                  </p>
                  <p className="text-[11.5px] text-ink-3">
                    SLA on-time {n(a.slaOnTimePercent).toFixed(0)}% · response{" "}
                    {a.slaResponseMinutes} min · pickup deviation ±
                    {a.maxPickupDeviationMinutes} min
                  </p>
                </div>
              ))}
              {!agreementRows.length ? (
                <div className="p-4">
                  <EmptyState title="No agreement on file" />
                </div>
              ) : null}
            </div>
            <div className="border-t border-line p-4">
              <p className="eyebrow mb-2">Save an agreement</p>
              <ActionForm action={createAgreementAction} submitLabel="Save agreement">
                <input type="hidden" name="companyId" value={company.id} />
                <div className="space-y-3">
                  <Field
                    label="Agreement name"
                    name="name"
                    required
                    placeholder="2026 Staff Transport SLA"
                  />
                  <Field
                    label="Pricing model"
                    name="pricingModel"
                    options={[
                      { value: "per_passenger", label: "Per passenger" },
                      { value: "per_trip", label: "Per trip" },
                      { value: "distance_based", label: "Distance based (per km)" },
                      { value: "monthly_fixed", label: "Fixed monthly" },
                    ]}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Field
                      label="Unit rate (GHS)"
                      name="unitRate"
                      type="number"
                      step="0.01"
                    />
                    <Field
                      label="Fixed monthly (GHS)"
                      name="fixedMonthlyAmount"
                      type="number"
                      step="0.01"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Start date" name="startDate" type="date" />
                    <Field label="End date" name="endDate" type="date" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field
                      label="On-time SLA (%)"
                      name="slaOnTimePercent"
                      type="number"
                      step="0.1"
                      defaultValue={95}
                    />
                    <Field
                      label="Response (min)"
                      name="slaResponseMinutes"
                      type="number"
                      defaultValue={15}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field
                      label="Pickup deviation (min)"
                      name="maxPickupDeviationMinutes"
                      type="number"
                      defaultValue={10}
                    />
                    <Field
                      label="Cancellation policy (hrs)"
                      name="cancellationPolicyHours"
                      type="number"
                      defaultValue={2}
                    />
                  </div>
                </div>
              </ActionForm>
            </div>
          </Panel>

          <Panel title="Invoices" eyebrow="Billing" padded={false}>
            <TableWrap>
              <THead>
                <TH>Invoice</TH>
                <TH>Period</TH>
                <TH align="right">Total</TH>
                <TH align="right">Paid</TH>
                <TH>Status</TH>
              </THead>
              <TBody>
                {invoiceRows.map((i) => (
                  <TR key={i.id}>
                    <TDPrimary>
                      <Link
                        href="/finance"
                        className="text-signal-text hover:underline"
                      >
                        {i.invoiceNo}
                      </Link>
                    </TDPrimary>
                    <TD>
                      {dateOnly(i.periodStart)} → {dateOnly(i.periodEnd)}
                    </TD>
                    <TD align="right">{money(i.total)}</TD>
                    <TD align="right">{money(i.amountPaid)}</TD>
                    <TD>
                      <StatusChip status={i.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
            {!invoiceRows.length ? (
              <div className="p-4">
                <EmptyState title="No invoices" />
              </div>
            ) : null}
          </Panel>

          <Panel title="Shifts & routes configured" eyebrow="Plan" padded={false}>
            <ul className="divide-y divide-line">
              {shiftRows.map((s) => (
                <li key={s.id} className="flex items-center justify-between px-4 py-2">
                  <span className="text-[12.5px]">{s.name}</span>
                  <span className="numeric text-[11.5px] text-ink-3">
                    {s.startTime}–{s.endTime} (grace {s.graceMinutes}m)
                  </span>
                </li>
              ))}
              {routeRows.map((r) => (
                <li key={`r${r.id}`} className="flex items-center justify-between px-4 py-2">
                  <span className="text-[12.5px]">{r.name}</span>
                  <span className="numeric text-[11.5px] text-ink-3">
                    {humanize(r.direction)} · {n(r.estimatedKm)} km
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
