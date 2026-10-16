import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  companies,
  driverEarnings,
  driverShifts,
  drivers,
  feedback,
  trips,
  users,
  vehicles,
} from "@/db/schema";
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
import { createDriverAction, updateDriverAction } from "@/app/actions/admin";
import { requireSection } from "@/lib/auth";
import { getDriverPerformance } from "@/lib/queries";
import { dateOnly, isoDaysFromNow, money, n, todayISO } from "@/lib/utils";

export const dynamic = "force-dynamic";

const DRIVER_STATUS = ["available", "on_trip", "off_duty", "unavailable"];

export default async function DriversPage() {
  await requireSection("drivers");

  const rows = await db
    .select({
      driver: drivers,
      vehicle: vehicles.registrationNo,
      email: users.email,
      trips: sql<number>`(select count(*) from trips t where t.driver_id = ${drivers.id})`,
      completed: sql<number>`(select count(*) from trips t where t.driver_id = ${drivers.id} and t.status = 'completed')`,
      incidents: sql<number>`(select count(*) from incidents i where i.driver_id = ${drivers.id})`,
      earnings: sql<string>`(select coalesce(sum(de.total), 0) from driver_earnings de where de.driver_id = ${drivers.id} and de.status <> 'paid')`,
      login: users.lastLoginAt,
    })
    .from(drivers)
    .leftJoin(
      vehicles,
      eq(vehicles.id, sql`(select v.id from vehicles v where v.assigned_driver_id = ${drivers.id} limit 1)`),
    )
    .leftJoin(users, eq(users.id, drivers.userId))
    .orderBy(asc(drivers.fullName));

  const roster = await db
    .select({ shift: driverShifts, driver: drivers.fullName })
    .from(driverShifts)
    .innerJoin(drivers, eq(drivers.id, driverShifts.driverId))
    .where(eq(driverShifts.shiftDate, todayISO()))
    .orderBy(asc(driverShifts.startTime));

  const performance = await getDriverPerformance(8);
  const complaints = await db
    .select()
    .from(feedback)
    .where(eq(feedback.category, "complaint"))
    .orderBy(desc(feedback.createdAt))
    .limit(5);
  const companyOptions = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies);
  const licenseAlerts = rows.filter(
    (r) => r.driver.licenseExpiry && r.driver.licenseExpiry <= isoDaysFromNow(60),
  );

  const totalEarnings = rows.reduce((s, r) => s + n(r.earnings), 0);
  const onTrip = rows.filter((r) => r.driver.status === "on_trip").length;

  return (
    <div>
      <PageHeader
        eyebrow="Assets"
        title="Driver management"
        subtitle="Driver records, licences, availability, duty roster, performance and earnings."
      />

      <MetricStrip>
        <MetricCell
          label="Drivers"
          value={rows.length}
          hint={`${rows.filter((r) => r.driver.status === "available").length} available now`}
        />
        <MetricCell label="On duty / on trip" value={onTrip} tone="live" />
        <MetricCell
          label="Licence alerts (60d)"
          value={licenseAlerts.length}
          tone={licenseAlerts.length ? "caution" : "ok"}
        />
        <MetricCell
          label="Accrued earnings"
          value={money(totalEarnings)}
          hint="Pending payroll approval"
        />
      </MetricStrip>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Driver register"
          subtitle={`${rows.length} drivers`}
          padded={false}
        >
          <TableWrap>
            <THead>
              <TR>
                <TH>Driver</TH>
                <TH>Licence</TH>
                <TH>Vehicle</TH>
                <TH align="right">Trips</TH>
                <TH align="right">Rating</TH>
                <TH align="right">Earnings</TH>
                <TH>Status</TH>
                <TH align="right" />
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.driver.id}>
                  <TDPrimary>
                    {r.driver.fullName}
                    <p className="mt-0.5 text-[11px] font-normal text-ink-3">
                      {r.driver.phone}
                    </p>
                    <p className="text-[11px] font-normal text-ink-3">
                      {r.email ?? "no portal account"}
                    </p>
                  </TDPrimary>
                  <TD>
                    <span className="numeric text-[12px]">{r.driver.licenseNo}</span>
                    <p className="mt-0.5 text-[11px] text-ink-3">
                      Class {r.driver.licenseClass ?? "—"}
                    </p>
                    <p
                      className={
                        r.driver.licenseExpiry &&
                        r.driver.licenseExpiry <= isoDaysFromNow(60)
                          ? "text-[11px] text-st-caution"
                          : "text-[11px] text-ink-3"
                      }
                    >
                      Exp {dateOnly(r.driver.licenseExpiry)}
                    </p>
                  </TD>
                  <TD>{r.vehicle ?? "—"}</TD>
                  <TD align="right">
                    {Number(r.completed)}/{Number(r.trips)}
                    <p className="mt-0.5 text-[11px] text-ink-3">
                      {Number(r.incidents)} incidents
                    </p>
                  </TD>
                  <TD align="right">
                    {n(r.driver.ratingAvg).toFixed(1)}
                    <p className="mt-0.5 text-[11px] text-ink-3">
                      {r.driver.ratingCount ?? 0} ratings
                    </p>
                  </TD>
                  <TD align="right">{money(r.earnings)}</TD>
                  <TD>
                    <StatusChip status={r.driver.status} />
                  </TD>
                  <TD align="right">
                    <InlineActionForm
                      action={updateDriverAction}
                      hiddenFields={{ id: r.driver.id }}
                      submitLabel="Edit"
                      variant="ghost"
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          {!rows.length ? (
            <div className="p-4">
              <EmptyState title="No drivers registered" />
            </div>
          ) : null}
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel
            title="Register a driver"
            subtitle="A driver app account is created when an email is supplied"
          >
            <ActionForm
              action={createDriverAction}
              submitLabel="Register driver"
              resetOnSuccess
            >
              <div className="flex flex-col gap-3">
                <Field label="Full name" name="fullName" required />
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="Phone"
                    name="phone"
                    required
                    placeholder="+233 24 000 0000"
                  />
                  <Field
                    label="Email"
                    name="email"
                    type="email"
                    hint="Used for the driver app login."
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Licence number" name="licenseNo" required />
                  <Field
                    label="Licence class"
                    name="licenseClass"
                    options={["B", "C", "D"].map((v) => ({
                      value: v,
                      label: `Class ${v}`,
                    }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Licence expiry" name="licenseExpiry" type="date" />
                  <Field label="Hired on" name="hiredAt" type="date" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="Base salary (GHS)"
                    name="baseSalary"
                    type="number"
                    step="0.01"
                    defaultValue={1400}
                  />
                  <Field
                    label="Trip allowance (GHS)"
                    name="tripAllowance"
                    type="number"
                    step="0.01"
                    defaultValue={35}
                  />
                </div>
                <Field label="Emergency contact name" name="emergencyContactName" />
                <Field label="Emergency contact phone" name="emergencyContactPhone" />
                <Field
                  label="Assigned company"
                  name="companyId"
                  options={[
                    { value: "", label: "Platform pool" },
                    ...companyOptions.map((c) => ({
                      value: String(c.id),
                      label: c.name,
                    })),
                  ]}
                />
              </div>
            </ActionForm>
          </Panel>

          <Panel title="Update driver record">
            <ActionForm action={updateDriverAction} submitLabel="Save driver">
              <div className="flex flex-col gap-3">
                <Field
                  label="Driver"
                  name="id"
                  required
                  options={rows.map((r) => ({
                    value: String(r.driver.id),
                    label: r.driver.fullName,
                  }))}
                />
                <Field
                  label="Availability"
                  name="status"
                  options={DRIVER_STATUS.map((s) => ({
                    value: s,
                    label: s.replace(/_/g, " "),
                  }))}
                />
                <Field label="Licence expiry" name="licenseExpiry" type="date" />
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="Base salary (GHS)"
                    name="baseSalary"
                    type="number"
                    step="0.01"
                  />
                  <Field
                    label="Trip allowance (GHS)"
                    name="tripAllowance"
                    type="number"
                    step="0.01"
                  />
                </div>
                <Field label="Notes" name="notes" type="textarea" />
              </div>
            </ActionForm>
          </Panel>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Today&apos;s duty roster"
          padded={false}
        >
          <TableWrap>
            <THead>
              <TR>
                <TH>Driver</TH>
                <TH>Shift</TH>
                <TH>Window</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {roster.map((r) => (
                <TR key={r.shift.id}>
                  <TDPrimary>{r.driver}</TDPrimary>
                  <TD>
                    <span className="capitalize">{r.shift.label}</span>
                  </TD>
                  <TD className="numeric">
                    {r.shift.startTime} – {r.shift.endTime}
                  </TD>
                  <TD>
                    <StatusChip status={r.shift.status} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          {!roster.length ? (
            <div className="p-4">
              <EmptyState
                title="No roster entries for today"
                hint="Driver shifts are created when trips are planned or manually scheduled."
              />
            </div>
          ) : null}
        </Panel>

        <Panel title="Performance leaderboard" padded={false}>
          <TableWrap>
            <THead>
              <TR>
                <TH>Driver</TH>
                <TH align="right">Trips</TH>
                <TH align="right">On time</TH>
                <TH align="right">Rating</TH>
              </TR>
            </THead>
            <TBody>
              {performance.map((p) => (
                <TR key={p.driverId}>
                  <TDPrimary>{p.driver}</TDPrimary>
                  <TD align="right">{p.tripsCompleted}</TD>
                  <TD align="right">
                    {p.tripsCompleted
                      ? `${((p.onTime / p.tripsCompleted) * 100).toFixed(0)}%`
                      : "—"}
                  </TD>
                  <TD align="right">{n(p.rating).toFixed(1)}</TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          <div className="border-t border-line p-3">
            <p className="eyebrow mb-2">Recent complaints</p>
            <ul className="flex flex-col gap-1 text-[11.5px] text-ink-2">
              {complaints.map((c) => (
                <li key={c.id} className="truncate">
                  {c.rating ? `${c.rating}/5 · ` : ""}
                  {c.comments}
                </li>
              ))}
              {!complaints.length ? <li>No complaints on record.</li> : null}
            </ul>
          </div>
        </Panel>
      </div>
    </div>
  );
}
