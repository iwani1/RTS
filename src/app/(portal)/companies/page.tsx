import Link from "next/link";
import { asc, count, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, invoices, serviceAgreements } from "@/db/schema";
import { ActionForm } from "@/components/action-form";
import {
  EmptyState,
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
import { createCompanyAction } from "@/app/actions/admin";
import { requireSection } from "@/lib/auth";
import { money, n } from "@/lib/utils";

export const dynamic = "force-dynamic";

const BILLING = [
  { value: "per_passenger", label: "Per passenger" },
  { value: "per_trip", label: "Per trip" },
  { value: "monthly_fixed", label: "Fixed monthly retainer" },
  { value: "distance_based", label: "Distance based (per km)" },
];

export default async function CompaniesPage() {
  await requireSection("companies");

  const rows = await db
    .select({
      company: companies,
      employeeCount: sql<number>`(select count(*) from employees e where e.company_id = ${companies.id})`,
      branchCount: sql<number>`(select count(*) from company_branches b where b.company_id = ${companies.id})`,
      bookingCount: sql<number>`(select count(*) from bookings bk where bk.company_id = ${companies.id})`,
      invoiced: sql<string>`(select coalesce(sum(i.total), 0) from invoices i where i.company_id = ${companies.id})`,
      paid: sql<string>`(select coalesce(sum(i.amount_paid), 0) from invoices i where i.company_id = ${companies.id})`,
    })
    .from(companies)
    .orderBy(asc(companies.name));

  const [agreementCount] = await db.select({ v: count() }).from(serviceAgreements);

  return (
    <div>
      <PageHeader
        eyebrow="Clients"
        title="Corporate clients"
        subtitle="Register companies, manage their service agreements and monitor transport spend per client."
        actions={
          <ButtonLink href="/reports" variant="outline">
            Client reports
          </ButtonLink>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Client register"
          subtitle={`${rows.length} clients`}
          padded={false}
        >
          <TableWrap>
            <THead>
              <TR>
                <TH>Company</TH>
                <TH>Status</TH>
                <TH align="right">Employees</TH>
                <TH align="right">Branches</TH>
                <TH align="right">Bookings</TH>
                <TH align="right">Invoiced</TH>
                <TH align="right">Outstanding</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.company.id}>
                  <TDPrimary>
                    <Link
                      href={`/companies/${r.company.id}`}
                      className="transition-colors hover:text-signal-text"
                    >
                      {r.company.name}
                    </Link>
                    <p className="mt-0.5 text-[11px] font-normal text-ink-3">
                      {r.company.industry ?? "—"}
                    </p>
                  </TDPrimary>
                  <TD>
                    <StatusChip status={r.company.status} />
                  </TD>
                  <TD align="right">{Number(r.employeeCount)}</TD>
                  <TD align="right">{Number(r.branchCount)}</TD>
                  <TD align="right">{Number(r.bookingCount)}</TD>
                  <TD align="right">{money(r.invoiced)}</TD>
                  <TD align="right">
                    <span
                      className={
                        n(r.invoiced) - n(r.paid) > 0 ? "text-st-caution" : "text-st-ok"
                      }
                    >
                      {money(n(r.invoiced) - n(r.paid))}
                    </span>
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          {!rows.length ? (
            <div className="p-4">
              <EmptyState
                title="No corporate clients yet"
                hint="Register your first client using the form."
              />
            </div>
          ) : null}
        </Panel>

        <Panel
          title="Register a corporate client"
          subtitle="Company profile and billing basis"
        >
          <ActionForm
            action={createCompanyAction}
            submitLabel="Register client"
            resetOnSuccess
          >
            <div className="flex flex-col gap-3">
              <Field label="Company name" name="name" required />
              <Field label="Primary contact" name="contactPerson" />
              <Field label="Contact email" name="email" type="email" />
              <Field label="Contact phone" name="phone" />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Industry"
                  name="industry"
                  placeholder="Financial services"
                />
                <Field label="City" name="city" placeholder="Accra" />
              </div>
              <Field label="Billing model" name="billingModel" options={BILLING} />
              <Field
                label="Monthly rate (GHS)"
                name="monthlyRate"
                type="number"
                step="0.01"
                placeholder="42000.00"
              />
            </div>
          </ActionForm>
          <p className="mt-3 text-[11.5px] text-ink-3">
            {Number(agreementCount?.v ?? 0)} service agreement(s) on file. Add
            branches, employees and SLAs from each client page.
          </p>
        </Panel>
      </div>
    </div>
  );
}
