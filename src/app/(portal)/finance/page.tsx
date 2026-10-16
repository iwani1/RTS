import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  companies,
  driverEarnings,
  drivers,
  invoiceLines,
  invoices,
  payments,
  serviceAgreements,
  trips,
} from "@/db/schema";
import { ActionForm } from "@/components/action-form";
import { BarChart } from "@/components/charts";
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
import { ButtonLink } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import {
  approveEarningsAction,
  generateInvoiceAction,
  recordPaymentAction,
} from "@/app/actions/admin";
import { companyScope, requireSection } from "@/lib/auth";
import { getRevenueByCompany } from "@/lib/queries";
import { dateOnly, humanize, isoDaysFromNow, money, n, todayISO } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const user = await requireSection("finance");
  const scope = companyScope(user);

  const invoiceRows = await db
    .select({ invoice: invoices, company: companies.name })
    .from(invoices)
    .innerJoin(companies, eq(companies.id, invoices.companyId))
    .where(scope ? eq(invoices.companyId, scope) : undefined)
    .orderBy(desc(invoices.issuedAt))
    .limit(30);

  const paymentRows = await db
    .select({
      payment: payments,
      company: companies.name,
      invoiceNo: invoices.invoiceNo,
    })
    .from(payments)
    .innerJoin(companies, eq(companies.id, payments.companyId))
    .leftJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(scope ? eq(payments.companyId, scope) : undefined)
    .orderBy(desc(payments.createdAt))
    .limit(20);

  const lineRows = invoiceRows.length
    ? await db
        .select({ line: invoiceLines, invoiceNo: invoices.invoiceNo })
        .from(invoiceLines)
        .innerJoin(invoices, eq(invoices.id, invoiceLines.invoiceId))
        .orderBy(desc(invoiceLines.id))
        .limit(24)
    : [];

  const earnings = await db
    .select({
      driver: drivers.fullName,
      base: sql<string>`sum(${driverEarnings.basePay})`,
      overtime: sql<string>`sum(${driverEarnings.overtimePay})`,
      allowance: sql<string>`sum(${driverEarnings.allowance})`,
      total: sql<string>`sum(${driverEarnings.total})`,
      trips: sql<number>`count(*)`,
      period: sql<string>`min(${driverEarnings.periodStart})`,
      status: sql<string>`min(${driverEarnings.status})`,
    })
    .from(driverEarnings)
    .innerJoin(drivers, eq(drivers.id, driverEarnings.driverId))
    .groupBy(drivers.fullName)
    .orderBy(desc(sql`sum(${driverEarnings.total})`));

  const companyOptions = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .orderBy(asc(companies.name));
  const agreementRows = await db
    .select()
    .from(serviceAgreements)
    .orderBy(desc(serviceAgreements.id));
  const revenue = await getRevenueByCompany();

  const [totals] = await db
    .select({
      invoiced: sql<string>`coalesce(sum(${invoices.total}), 0)`,
      paid: sql<string>`coalesce(sum(${invoices.amountPaid}), 0)`,
      overdue: sql<string>`coalesce(sum(case when ${invoices.status} = 'overdue' then ${invoices.total} - ${invoices.amountPaid} else 0 end), 0)`,
    })
    .from(invoices)
    .where(scope ? eq(invoices.companyId, scope) : undefined);

  const payrollTotal = earnings.reduce((s, e) => s + n(e.total), 0);
  const [tripCosts] = await db
    .select({
      trips: sql<number>`count(*)`,
      km: sql<string>`coalesce(sum(${trips.plannedKm}), 0)`,
    })
    .from(trips)
    .where(scope ? eq(trips.companyId, scope) : undefined);

  const outstanding = n(totals?.invoiced) - n(totals?.paid);

  return (
    <div>
      <PageHeader
        eyebrow="Finance"
        title="Billing, invoicing &amp; driver payroll"
        subtitle="Corporate contracts, monthly invoicing in GHS, collections and driver earnings."
      />

      <MetricStrip>
        <MetricCell label="Invoiced" value={money(totals?.invoiced)} />
        <MetricCell label="Collected" value={money(totals?.paid)} tone="ok" />
        <MetricCell
          label="Outstanding"
          value={money(outstanding)}
          tone={outstanding > 0 ? "caution" : "ok"}
        />
        <MetricCell
          label="Overdue"
          value={money(totals?.overdue)}
          tone={n(totals?.overdue) ? "critical" : "ok"}
        />
        <MetricCell
          label="Driver payroll accrued"
          value={money(payrollTotal)}
          hint={`${Number(tripCosts?.trips ?? 0)} trips · ${n(tripCosts?.km).toFixed(0)} km`}
        />
      </MetricStrip>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Invoices"
          subtitle={`${invoiceRows.length} shown`}
          padded={false}
        >
          <TableWrap>
            <THead>
              <TR>
                <TH>Invoice</TH>
                <TH>Client</TH>
                <TH>Period</TH>
                <TH align="right">Subtotal</TH>
                <TH align="right">Tax</TH>
                <TH align="right">Total</TH>
                <TH align="right">Paid</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {invoiceRows.map((i) => (
                <TR key={i.invoice.id}>
                  <TDPrimary className="numeric text-[12px]">
                    {i.invoice.invoiceNo}
                  </TDPrimary>
                  <TD>{i.company}</TD>
                  <TD>
                    <span className="numeric text-[12px]">
                      {dateOnly(i.invoice.periodStart)}
                    </span>
                    <p className="numeric mt-0.5 text-[11px] text-ink-3">
                      → {dateOnly(i.invoice.periodEnd)}
                    </p>
                  </TD>
                  <TD align="right">{money(i.invoice.subtotal)}</TD>
                  <TD align="right">{money(i.invoice.tax)}</TD>
                  <TD align="right" className="text-ink">
                    {money(i.invoice.total)}
                  </TD>
                  <TD align="right">{money(i.invoice.amountPaid)}</TD>
                  <TD>
                    <StatusChip status={i.invoice.status} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          {!invoiceRows.length ? (
            <div className="p-4">
              <EmptyState
                title="No invoices yet"
                hint="Generate one from completed trips."
              />
            </div>
          ) : null}

          <div className="border-t border-line p-4">
            <p className="eyebrow mb-2">Invoice lines</p>
            <TableWrap>
              <THead>
                <TR>
                  <TH>Invoice</TH>
                  <TH>Description</TH>
                  <TH align="right">Qty</TH>
                  <TH align="right">Unit price</TH>
                  <TH align="right">Amount</TH>
                </TR>
              </THead>
              <TBody>
                {lineRows.map((l) => (
                  <TR key={l.line.id}>
                    <TD className="numeric text-[12px]">{l.invoiceNo}</TD>
                    <TD>{l.line.description}</TD>
                    <TD align="right">{n(l.line.quantity)}</TD>
                    <TD align="right">{money(l.line.unitPrice)}</TD>
                    <TD align="right">{money(l.line.amount)}</TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Generate an invoice" subtitle="Derived from completed trips">
            <ActionForm
              action={generateInvoiceAction}
              submitLabel="Generate invoice"
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
                    label="Period start"
                    name="periodStart"
                    type="date"
                    required
                    defaultValue={isoDaysFromNow(-30)}
                  />
                  <Field
                    label="Period end"
                    name="periodEnd"
                    type="date"
                    required
                    defaultValue={todayISO()}
                  />
                </div>
                <Field label="Due date" name="dueDate" type="date" />
              </div>
            </ActionForm>
            <Notice tone="caution" className="mt-4 text-[11.5px]">
              Payment collection is not live: no Paystack/Flutterwave or bank
              transfer credentials are configured. The payment form below records
              reconciled settlements only.
            </Notice>
          </Panel>

          <Panel title="Record a payment">
            <ActionForm
              action={recordPaymentAction}
              submitLabel="Record payment"
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
                <Field
                  label="Invoice (optional)"
                  name="invoiceId"
                  options={[
                    { value: "", label: "Unallocated payment" },
                    ...invoiceRows.map((i) => ({
                      value: String(i.invoice.id),
                      label: `${i.invoice.invoiceNo} · ${money(i.invoice.total)}`,
                    })),
                  ]}
                />
                <Field
                  label="Amount (GHS)"
                  name="amount"
                  type="number"
                  step="0.01"
                  required
                />
                <Field
                  label="Method"
                  name="method"
                  options={[
                    { value: "bank_transfer", label: "Bank transfer" },
                    { value: "mobile_money", label: "Mobile money" },
                    { value: "paystack", label: "Paystack" },
                    { value: "flutterwave", label: "Flutterwave" },
                    { value: "cheque", label: "Cheque" },
                    { value: "cash", label: "Cash" },
                  ]}
                />
                <Field label="Reference" name="reference" placeholder="TRF-0099123" />
                <Field label="Notes" name="notes" type="textarea" />
              </div>
            </ActionForm>
          </Panel>

          <Panel title="Revenue by client">
            <BarChart
              data={revenue.map((r) => ({
                label: r.company.split(" ")[0],
                invoiced: r.total,
                collected: r.paid,
              }))}
              valueKey="invoiced"
              unit="GHS"
            />
          </Panel>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Driver earnings &amp; payroll"
          padded={false}
        >
          <TableWrap>
            <THead>
              <TR>
                <TH>Driver</TH>
                <TH align="right">Trips</TH>
                <TH align="right">Base</TH>
                <TH align="right">Overtime</TH>
                <TH align="right">Allowance</TH>
                <TH align="right">Total</TH>
                <TH>Period</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {earnings.map((e) => (
                <TR key={e.driver}>
                  <TDPrimary>{e.driver}</TDPrimary>
                  <TD align="right">{Number(e.trips)}</TD>
                  <TD align="right">{money(e.base)}</TD>
                  <TD align="right">{money(e.overtime)}</TD>
                  <TD align="right">{money(e.allowance)}</TD>
                  <TD align="right" className="text-ink">
                    {money(e.total)}
                  </TD>
                  <TD className="numeric text-[12px]">{dateOnly(e.period)}</TD>
                  <TD>
                    <StatusChip status={e.status ?? "accrued"} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          {!earnings.length ? (
            <div className="p-4">
              <EmptyState
                title="No driver earnings yet"
                hint="Earnings accrue automatically when a driver completes a trip."
              />
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3 border-t border-line p-4">
            <ButtonLink href="/api/reports/export?type=payroll" variant="outline" size="sm">
              Export payroll CSV
            </ButtonLink>
            <ActionForm
              action={approveEarningsAction}
              submitLabel="Approve accrued earnings"
            >
              <Field
                label="Period start"
                name="periodStart"
                type="date"
                required
                defaultValue={isoDaysFromNow(-30)}
              />
            </ActionForm>
          </div>
        </Panel>

        <Panel title="Contracts &amp; pricing" padded={false}>
          <ul className="divide-y divide-line">
            {agreementRows.map((a) => (
              <li key={a.id} className="px-3.5 py-3">
                <p className="text-[12.5px] font-medium text-ink">{a.name}</p>
                <p className="mt-0.5 text-[11.5px] text-ink-2">
                  {humanize(a.pricingModel)} · unit rate {money(a.unitRate)} · fixed{" "}
                  {money(a.fixedMonthlyAmount)}
                </p>
                <p className="numeric mt-0.5 text-[11px] text-ink-3">
                  {dateOnly(a.startDate)} → {a.endDate ? dateOnly(a.endDate) : "open"} ·{" "}
                  {a.currency}
                </p>
              </li>
            ))}
          </ul>
          <div className="border-t border-line p-3.5">
            <p className="eyebrow mb-2">Recent payments</p>
            <ul className="flex flex-col gap-1 text-[11.5px]">
              {paymentRows.map((p) => (
                <li
                  key={p.payment.id}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate text-ink-2">
                    {p.company} · {p.invoiceNo ?? "unallocated"}
                  </span>
                  <span className="numeric shrink-0 text-ink">
                    {money(p.payment.amount)} · {humanize(p.payment.method)}
                  </span>
                </li>
              ))}
              {!paymentRows.length ? (
                <li className="text-ink-3">No payments recorded.</li>
              ) : null}
            </ul>
          </div>
        </Panel>
      </div>
    </div>
  );
}
