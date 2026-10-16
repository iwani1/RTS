import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { bookings, companies, employees, trips, users } from "@/db/schema";
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
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { decideBookingAction, moveBookingAction, planTripsAction } from "@/app/actions/ops";
import { companyScope, requireSection } from "@/lib/auth";
import { dateOnly, humanize, timeOnly, todayISO } from "@/lib/utils";

export const dynamic = "force-dynamic";

const BOOKING_STATUSES = [
  "pending",
  "approved",
  "waitlisted",
  "assigned",
  "in_progress",
  "completed",
  "no_show",
  "cancelled",
  "rejected",
];

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; company?: string; date?: string }>;
}) {
  const user = await requireSection("bookings");
  const scope = companyScope(user);
  const { q = "", status = "", company = "", date = "" } = await searchParams;

  const filters = [
    scope ? eq(bookings.companyId, scope) : undefined,
    company && !scope ? eq(bookings.companyId, Number(company)) : undefined,
    status ? eq(bookings.status, status as "pending") : undefined,
    date ? eq(bookings.bookingDate, date) : undefined,
    q
      ? or(
          ilike(employees.fullName, `%${q}%`),
          ilike(bookings.reference, `%${q}%`),
          ilike(employees.employeeCode, `%${q}%`),
        )
      : undefined,
  ].filter(Boolean);

  const rows = await db
    .select({
      booking: bookings,
      employee: employees,
      company: companies.name,
      tripRef: trips.reference,
      tripCapacity: trips.capacity,
      approver: users.fullName,
    })
    .from(bookings)
    .innerJoin(employees, eq(employees.id, bookings.employeeId))
    .innerJoin(companies, eq(companies.id, bookings.companyId))
    .leftJoin(trips, eq(trips.id, bookings.tripId))
    .leftJoin(users, eq(users.id, bookings.approvedById))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(bookings.bookingDate), desc(bookings.id))
    .limit(80);

  const statusCounts = await db
    .select({ status: bookings.status, v: bookings.id })
    .from(bookings)
    .where(scope ? eq(bookings.companyId, scope) : undefined);

  const tally = statusCounts.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  const companyOptions = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies);
  const tripOptions = await db
    .select({
      id: trips.id,
      reference: trips.reference,
      capacity: trips.capacity,
      bookedSeats: trips.bookedSeats,
      tripDate: trips.tripDate,
    })
    .from(trips)
    .orderBy(desc(trips.tripDate))
    .limit(40);

  const pending = Number(tally.pending ?? 0);
  const waitlisted = Number(tally.waitlisted ?? 0);
  const cancelled = Number(tally.cancelled ?? 0) + Number(tally.no_show ?? 0);

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Bookings &amp; reservations"
        subtitle="Approve requests, manage waiting lists, move passengers between trips and audit cancellations."
      />

      <MetricStrip>
        <MetricCell label="Total bookings" value={statusCounts.length} />
        <MetricCell
          label="Pending approval"
          value={pending}
          tone={pending ? "caution" : "ok"}
        />
        <MetricCell label="Waitlisted" value={waitlisted} tone="scheduled" />
        <MetricCell label="Assigned to trips" value={Number(tally.assigned ?? 0)} />
        <MetricCell
          label="Cancelled / no-show"
          value={cancelled}
          tone={cancelled ? "critical" : "ok"}
        />
      </MetricStrip>

      <Panel className="mt-4" title="Search bookings">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="q"
              className="font-display text-[12.5px] font-medium text-ink-2"
            >
              Search
            </label>
            <Input
              id="q"
              name="q"
              defaultValue={q}
              placeholder="Employee, code or reference"
              className="w-[230px]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="status"
              className="font-display text-[12.5px] font-medium text-ink-2"
            >
              Status
            </label>
            <Select id="status" name="status" defaultValue={status} className="w-[170px]">
              <option value="">Any status</option>
              {BOOKING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
          </div>
          {!scope ? (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="company"
                className="font-display text-[12.5px] font-medium text-ink-2"
              >
                Client
              </label>
              <Select
                id="company"
                name="company"
                defaultValue={company}
                className="w-[190px]"
              >
                <option value="">All clients</option>
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
              htmlFor="date"
              className="font-display text-[12.5px] font-medium text-ink-2"
            >
              Service date
            </label>
            <Input id="date" name="date" type="date" defaultValue={date} className="w-[168px]" />
          </div>
          <Button type="submit" variant="signal" size="sm">
            Apply
          </Button>
        </form>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Booking register"
          subtitle={`${rows.length} shown`}
          padded={false}
        >
          <TableWrap>
            <THead>
              <TR>
                <TH>Reference</TH>
                <TH>Employee</TH>
                <TH>Leg &amp; date</TH>
                <TH>Trip</TH>
                <TH>Pickup</TH>
                <TH>Status</TH>
                <TH align="right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.booking.id}>
                  <TDPrimary className="numeric text-[12px]">
                    {r.booking.reference}
                  </TDPrimary>
                  <TD>
                    <span className="text-[13px] text-ink">{r.employee.fullName}</span>
                    <p className="mt-0.5 text-[11px] text-ink-3">
                      {r.employee.employeeCode} · {r.company}
                    </p>
                  </TD>
                  <TD>
                    {humanize(r.booking.direction)}
                    <p className="mt-0.5 text-[11px] text-ink-3">
                      {dateOnly(r.booking.bookingDate)}
                    </p>
                  </TD>
                  <TD>
                    {r.tripRef ?? (
                      <span className="text-st-caution">not assigned</span>
                    )}
                    {r.booking.pickupTime ? (
                      <p className="mt-0.5 text-[11px] text-ink-3">
                        Pickup {timeOnly(r.booking.pickupTime)}
                      </p>
                    ) : null}
                  </TD>
                  <TD>
                    {r.booking.pickupAddress?.slice(0, 24) ?? "—"}
                    <p className="mt-0.5 text-[11px] text-ink-3">
                      Code {r.booking.otpCode ?? "—"}
                    </p>
                  </TD>
                  <TD>
                    <StatusChip status={r.booking.status} />
                  </TD>
                  <TD align="right">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {["pending", "waitlisted"].includes(r.booking.status) ? (
                        <>
                          <InlineActionForm
                            action={decideBookingAction}
                            hiddenFields={{
                              bookingId: r.booking.id,
                              decision: "approve",
                            }}
                            submitLabel="Approve"
                            variant="primary"
                          />
                          <InlineActionForm
                            action={decideBookingAction}
                            hiddenFields={{
                              bookingId: r.booking.id,
                              decision: "reject",
                            }}
                            submitLabel="Reject"
                            variant="ghost"
                          />
                        </>
                      ) : null}
                      {!["completed", "cancelled", "no_show"].includes(
                        r.booking.status,
                      ) ? (
                        <InlineActionForm
                          action={decideBookingAction}
                          hiddenFields={{
                            bookingId: r.booking.id,
                            decision: "cancel",
                          }}
                          submitLabel="Cancel"
                          variant="danger"
                          confirm={`Cancel booking ${r.booking.reference}?`}
                        />
                      ) : null}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          {!rows.length ? (
            <div className="p-4">
              <EmptyState title="No bookings match your filters" />
            </div>
          ) : null}
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel
            title="Waiting list decision"
            subtitle="Move a waitlisted passenger onto a trip"
          >
            <ActionForm action={moveBookingAction} submitLabel="Move booking">
              <div className="flex flex-col gap-3">
                <Field
                  label="Booking"
                  name="bookingId"
                  required
                  options={rows
                    .filter((r) => !r.booking.tripId)
                    .map((r) => ({
                      value: String(r.booking.id),
                      label: `${r.booking.reference} · ${r.employee.fullName} (${humanize(r.booking.status)})`,
                    }))}
                />
                <Field
                  label="Target trip"
                  name="tripId"
                  required
                  options={tripOptions.map((t) => ({
                    value: String(t.id),
                    label: `${t.reference} · ${dateOnly(t.tripDate)} · ${t.bookedSeats}/${t.capacity} seats`,
                  }))}
                />
              </div>
            </ActionForm>
            <p className="mt-3 text-[11.5px] text-ink-3">
              Capacity is validated before the move — overbooking is rejected with
              the remaining seat count.
            </p>
          </Panel>

          <Panel
            title="Approve all eligible requests"
            subtitle="Then run the planner"
          >
            <ActionForm
              action={planTripsAction}
              submitLabel="Plan trips for approved bookings"
            >
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
                    { value: "home_to_office", label: "Home to office" },
                    { value: "office_to_home", label: "Office to home" },
                  ]}
                />
                {!scope ? (
                  <Field
                    label="Client"
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

          <Panel title="Recent decisions">
            <ul className="flex flex-col gap-2">
              {rows
                .filter((r) => r.approver)
                .slice(0, 6)
                .map((r) => (
                  <li
                    key={`a${r.booking.id}`}
                    className="rounded-[8px] border border-line px-2.5 py-2"
                  >
                    <span className="text-[12.5px] font-medium text-ink">
                      {r.employee.fullName}
                    </span>{" "}
                    <span className="text-[12px] text-ink-2">
                      — {humanize(r.booking.status)} by {r.approver}
                    </span>
                    <p className="mt-0.5 text-[11px] text-ink-3">
                      {dateOnly(r.booking.bookingDate)} ·{" "}
                      {humanize(r.booking.direction)} · pickup{" "}
                      {r.booking.pickupTime ?? "TBC"}
                    </p>
                  </li>
                ))}
              {!rows.some((r) => r.approver) ? (
                <li className="text-[12px] text-ink-3">No decisions recorded yet.</li>
              ) : null}
            </ul>
          </Panel>
        </div>
      </div>

      <p className="mt-4 text-[11.5px] text-ink-3">
        Bookings are matched to trips with a hard capacity check; duplicates for
        the same employee, date and direction are rejected at creation.
      </p>
    </div>
  );
}
