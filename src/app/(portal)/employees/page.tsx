import Link from "next/link";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { branches, companies, employees, shifts } from "@/db/schema";
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
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/input";
import {
  assignEmployeeShiftAction,
  createEmployeeAction,
  createShiftAction,
  importEmployeesAction,
  toggleEmployeeAction,
} from "@/app/actions/admin";
import { companyScope, requireSection } from "@/lib/auth";

export const dynamic = "force-dynamic";

const CSV_TEMPLATE =
  "employee_code,full_name,email,phone,department,job_title,home_address,zone,home_lat,home_lng\nSFS-2001,Kofi Amankwa,kofi@example.com,+233241110001,Finance,Officer,Dansoman Accra,Dansoman,5.5490,-0.2401";

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; company?: string; status?: string }>;
}) {
  const user = await requireSection("employees");
  const scope = companyScope(user);
  const { q = "", company = "", status = "" } = await searchParams;

  const filters = [
    scope ? eq(employees.companyId, scope) : undefined,
    company && !scope ? eq(employees.companyId, Number(company)) : undefined,
    q
      ? or(
          ilike(employees.fullName, `%${q}%`),
          ilike(employees.employeeCode, `%${q}%`),
          ilike(employees.email, `%${q}%`),
        )
      : undefined,
    status === "active"
      ? eq(employees.active, true)
      : status === "inactive"
        ? eq(employees.active, false)
        : undefined,
  ].filter(Boolean);

  const rows = await db
    .select({
      employee: employees,
      company: companies.name,
      branch: branches.name,
      shift: shifts.name,
      shiftStart: shifts.startTime,
      shiftEnd: shifts.endTime,
      bookingCount: sql<number>`(select count(*) from bookings b where b.employee_id = ${employees.id})`,
    })
    .from(employees)
    .innerJoin(companies, eq(companies.id, employees.companyId))
    .leftJoin(branches, eq(branches.id, employees.branchId))
    .leftJoin(shifts, eq(shifts.id, employees.shiftId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(employees.fullName))
    .limit(100);

  const [stats] = await db
    .select({
      total: sql<number>`count(*)`,
      active: sql<number>`sum(case when ${employees.active} then 1 else 0 end)`,
      vip: sql<number>`sum(case when ${employees.vip} then 1 else 0 end)`,
      zoned: sql<number>`sum(case when ${employees.zone} is not null then 1 else 0 end)`,
      geocoded: sql<number>`sum(case when ${employees.homeLat} is not null then 1 else 0 end)`,
    })
    .from(employees)
    .where(scope ? eq(employees.companyId, scope) : undefined);

  const companyOptions = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .orderBy(asc(companies.name));
  const branchOptions = await db
    .select({ id: branches.id, name: branches.name, companyId: branches.companyId })
    .from(branches);
  const shiftOptions = await db
    .select({ id: shifts.id, name: shifts.name, companyId: shifts.companyId })
    .from(shifts)
    .orderBy(desc(shifts.id));

  const scopedCompanyId = scope ?? (companyOptions[0]?.id ?? 0);
  const geocoded = Number(stats?.geocoded ?? 0);
  const total = Number(stats?.total ?? 0);

  return (
    <div>
      <PageHeader
        eyebrow="People"
        title="Employee register"
        subtitle="Company employees, their work shifts, home pickup zones and portal account links."
      />

      <MetricStrip>
        <MetricCell label="Registered" value={total} />
        <MetricCell label="Active" value={Number(stats?.active ?? 0)} tone="ok" />
        <MetricCell label="VIP entitlement" value={Number(stats?.vip ?? 0)} tone="scheduled" />
        <MetricCell
          label="Zoned"
          value={Number(stats?.zoned ?? 0)}
          hint="Used for route clustering"
        />
        <MetricCell
          label="Geocoded homes"
          value={geocoded}
          hint="Required for optimised routing"
          tone={geocoded < total ? "caution" : "ok"}
        />
      </MetricStrip>

      <Panel className="mt-4" title="Search &amp; filter">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="q" className="font-display text-[12.5px] font-medium text-ink-2">
              Search
            </label>
            <Input
              id="q"
              name="q"
              defaultValue={q}
              placeholder="Name, code or email"
              className="w-[230px]"
            />
          </div>
          {!scope ? (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="company"
                className="font-display text-[12.5px] font-medium text-ink-2"
              >
                Company
              </label>
              <Select
                id="company"
                name="company"
                defaultValue={company}
                className="w-[200px]"
              >
                <option value="">All companies</option>
                {companyOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="status"
              className="font-display text-[12.5px] font-medium text-ink-2"
            >
              Status
            </label>
            <Select id="status" name="status" defaultValue={status} className="w-[160px]">
              <option value="">Any status</option>
              <option value="active">Active only</option>
              <option value="inactive">Deactivated</option>
            </Select>
          </div>
          <Button type="submit" variant="signal" size="sm">
            Apply filters
          </Button>
        </form>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Employees"
          subtitle={`${rows.length} shown`}
          padded={false}
        >
          <TableWrap>
            <THead>
              <TR>
                <TH>Employee</TH>
                <TH>Company</TH>
                <TH>Shift</TH>
                <TH>Zone</TH>
                <TH align="right">Bookings</TH>
                <TH>Status</TH>
                <TH align="right" />
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.employee.id}>
                  <TDPrimary>
                    {r.employee.fullName}
                    {r.employee.vip ? (
                      <span className="ml-1.5 text-[10.5px] uppercase tracking-wide text-signal-text">
                        VIP
                      </span>
                    ) : null}
                    <p className="mt-0.5 text-[11px] font-normal text-ink-3">
                      {r.employee.employeeCode} · {r.employee.email ?? "no email"}
                    </p>
                    <p className="text-[11px] font-normal text-ink-3">
                      {r.employee.homeAddress ?? "no address on file"}
                    </p>
                  </TDPrimary>
                  <TD>
                    {r.company}
                    <p className="mt-0.5 text-[11px] text-ink-3">{r.branch ?? "—"}</p>
                  </TD>
                  <TD>
                    {r.shift ?? "—"}
                    <p className="numeric mt-0.5 text-[11px] text-ink-3">
                      {r.shiftStart ?? ""}
                      {r.shiftEnd ? `– ${r.shiftEnd}` : ""}
                    </p>
                  </TD>
                  <TD>{r.employee.zone ?? "—"}</TD>
                  <TD align="right">{Number(r.bookingCount)}</TD>
                  <TD>
                    <StatusChip status={r.employee.active ? "active" : "inactive"} />
                  </TD>
                  <TD align="right">
                    <InlineActionForm
                      action={toggleEmployeeAction}
                      hiddenFields={{
                        id: r.employee.id,
                        active: r.employee.active ? "false" : "true",
                      }}
                      submitLabel={r.employee.active ? "Deactivate" : "Activate"}
                      variant="ghost"
                      confirm={r.employee.active ? "Deactivate this employee?" : undefined}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          {!rows.length ? (
            <div className="p-4">
              <EmptyState title="No employees match your filters" />
            </div>
          ) : null}

          <div className="border-t border-line p-4">
            <p className="eyebrow mb-2">Change an employee&apos;s work shift</p>
            <ActionForm action={assignEmployeeShiftAction} submitLabel="Assign shift">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Employee"
                  name="id"
                  required
                  options={rows.map((r) => ({
                    value: String(r.employee.id),
                    label: `${r.employee.fullName} (${r.employee.employeeCode})`,
                  }))}
                />
                <Field
                  label="Shift"
                  name="shiftId"
                  required
                  options={shiftOptions
                    .filter((s) => !scope || s.companyId === scope)
                    .map((s) => ({ value: String(s.id), label: s.name }))}
                />
              </div>
            </ActionForm>
            <p className="mt-2 text-[11.5px] text-ink-3">
              Shift start time drives the calculated pickup time during route
              planning.
            </p>
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Register an employee">
            <ActionForm
              action={createEmployeeAction}
              submitLabel="Register employee"
              resetOnSuccess
            >
              <div className="flex flex-col gap-3">
                {!scope ? (
                  <Field
                    label="Company"
                    name="companyId"
                    required
                    options={companyOptions.map((c) => ({
                      value: String(c.id),
                      label: c.name,
                    }))}
                  />
                ) : null}
                <Field label="Full name" name="fullName" required />
                <Field
                  label="Employee code"
                  name="employeeCode"
                  hint="Leave blank to auto-generate."
                />
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Email" name="email" type="email" />
                  <Field label="Phone" name="phone" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Department" name="department" />
                  <Field label="Job title" name="jobTitle" />
                </div>
                <Field label="Home address" name="homeAddress" />
                <Field
                  label="Pickup zone"
                  name="zone"
                  placeholder="Dansoman"
                  hint="Zone is used to cluster passengers into routes."
                />
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="Home latitude"
                    name="homeLat"
                    type="number"
                    step="0.0001"
                  />
                  <Field
                    label="Home longitude"
                    name="homeLng"
                    type="number"
                    step="0.0001"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="Branch"
                    name="branchId"
                    options={[
                      { value: "", label: "—" },
                      ...branchOptions
                        .filter((b) => !scope || b.companyId === scope)
                        .map((b) => ({ value: String(b.id), label: b.name })),
                    ]}
                  />
                  <Field
                    label="Shift"
                    name="shiftId"
                    options={[
                      { value: "", label: "—" },
                      ...shiftOptions
                        .filter((s) => !scope || s.companyId === scope)
                        .map((s) => ({ value: String(s.id), label: s.name })),
                    ]}
                  />
                </div>
                <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
                  <Checkbox name="vip" />
                  VIP / priority transport entitlement
                </label>
              </div>
            </ActionForm>
          </Panel>

          <Panel title="Bulk CSV import" subtitle="Header row required">
            <Notice tone="caution" className="text-[11.5px]">
              Paste CSV content. In production this form accepts a file upload and
              runs asynchronously with row-level validation.
            </Notice>
            <ActionForm
              action={importEmployeesAction}
              submitLabel="Import employees"
              className="mt-3"
            >
              {!scope ? (
                <Field
                  label="Company"
                  name="companyId"
                  required
                  options={companyOptions.map((c) => ({
                    value: String(c.id),
                    label: c.name,
                  }))}
                />
              ) : null}
              <Field
                label="CSV data"
                name="csv"
                type="textarea"
                rows={6}
                placeholder={CSV_TEMPLATE}
                className="mt-3"
              />
            </ActionForm>
            <pre className="mt-3 overflow-x-auto rounded-[8px] bg-surface-2 p-2.5 text-[10.5px] leading-relaxed text-ink-2">
              {CSV_TEMPLATE}
            </pre>
          </Panel>

          <Panel title="Configure a work shift">
            <ActionForm action={createShiftAction} submitLabel="Save shift">
              <div className="flex flex-col gap-3">
                {!scope ? (
                  <Field
                    label="Company"
                    name="companyId"
                    required
                    options={companyOptions.map((c) => ({
                      value: String(c.id),
                      label: c.name,
                    }))}
                  />
                ) : null}
                <Field
                  label="Shift name"
                  name="name"
                  required
                  placeholder="Morning (08:00 - 17:00)"
                />
                <div className="grid grid-cols-3 gap-2">
                  <Field
                    label="Start"
                    name="startTime"
                    type="time"
                    required
                    defaultValue="08:00"
                  />
                  <Field
                    label="End"
                    name="endTime"
                    type="time"
                    required
                    defaultValue="17:00"
                  />
                  <Field
                    label="Grace (min)"
                    name="graceMinutes"
                    type="number"
                    defaultValue={15}
                  />
                </div>
              </div>
            </ActionForm>
            <p className="mt-2 text-[11.5px] text-ink-3">
              Current scope:{" "}
              {scope
                ? companyOptions.find((c) => c.id === scope)?.name
                : "all companies"}{" "}
              · {shiftOptions.filter((s) => !scope || s.companyId === scope).length}{" "}
              shift templates
            </p>
          </Panel>

          <Panel title="Transport policy" subtitle={`Company ID ${scopedCompanyId}`}>
            <ul className="list-inside list-disc space-y-1.5 text-[12px] text-ink-2">
              <li>
                One seat per employee per leg; duplicate bookings are rejected
                automatically.
              </li>
              <li>
                Pickup times are derived from shift start time minus the planned
                route duration plus a 10 minute buffer.
              </li>
              <li>
                Cancellations inside the policy window require coordinator
                approval.
              </li>
              <li>
                Full policy configuration lives in the service agreement —{" "}
                <Link
                  href={`/companies/${scopedCompanyId}`}
                  className="text-ink underline transition-colors hover:text-signal-text"
                >
                  open client record
                </Link>
                .
              </li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
