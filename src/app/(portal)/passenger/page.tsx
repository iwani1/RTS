import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  companies,
  drivers,
  employees,
  routes,
  serviceAgreements,
  shifts,
  trips,
  vehicles,
} from "@/db/schema";
import { ActionForm, InlineActionForm } from "@/components/action-form";
import {
  ButtonLink,
  DefinitionList,
  EmptyState,
  Field,
  MetricCell,
  MetricStrip,
  Notice,
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
  cancelOwnBookingAction,
  createBookingAction,
  updateHomeAddressAction,
} from "@/app/actions/ops";
import { requireSection } from "@/lib/auth";
import { dateOnly, humanize, n, todayISO } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PassengerPage() {
  const user = await requireSection("passenger");

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.userId, user.id))
    .limit(1);

  if (!employee) {
    return (
      <div>
        <PageHeader
          eyebrow="Passenger"
          title="My transport"
          subtitle="Employee self service"
        />
        <Panel title="No employee record linked">
          <p className="text-[13px] leading-relaxed text-ink-2">
            Your login is not yet linked to an employee record. Ask your HR or transport
            coordinator to register you, then sign in again — the link happens
            automatically when your work email matches.
          </p>
          <div className="mt-4">
            <ButtonLink href="/settings">Account settings</ButtonLink>
          </div>
        </Panel>
      </div>
    );
  }

  const today = todayISO();
  const [shift] = employee.shiftId
    ? await db.select().from(shifts).where(eq(shifts.id, employee.shiftId)).limit(1)
    : [];
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, employee.companyId))
    .limit(1);
  const [agreement] = await db
    .select()
    .from(serviceAgreements)
    .where(eq(serviceAgreements.companyId, employee.companyId))
    .limit(1);

  const upcoming = await db
    .select({
      booking: bookings,
      trip: trips,
      vehicle: vehicles,
      driver: drivers,
      route: routes.name,
    })
    .from(bookings)
    .leftJoin(trips, eq(trips.id, bookings.tripId))
    .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
    .leftJoin(drivers, eq(drivers.id, trips.driverId))
    .leftJoin(routes, eq(routes.id, bookings.routeId))
    .where(
      and(
        eq(bookings.employeeId, employee.id),
        inArray(bookings.status, [
          "pending",
          "approved",
          "waitlisted",
          "assigned",
          "in_progress",
        ]),
      ),
    )
    .orderBy(bookings.bookingDate)
    .limit(8);

  const history = await db
    .select({ booking: bookings, trip: trips })
    .from(bookings)
    .leftJoin(trips, eq(trips.id, bookings.tripId))
    .where(
      and(
        eq(bookings.employeeId, employee.id),
        inArray(bookings.status, ["completed", "cancelled", "no_show"]),
      ),
    )
    .orderBy(desc(bookings.bookingDate))
    .limit(10);

  const routeOptions = await db
    .select({ id: routes.id, name: routes.name, direction: routes.direction })
    .from(routes)
    .where(eq(routes.companyId, employee.companyId));

  const completedCount = history.filter((h) => h.booking.status === "completed").length;

  return (
    <div>
      <PageHeader
        eyebrow="Passenger"
        title={`Good day, ${employee.fullName.split(" ")[0]}`}
        subtitle={`${company?.name ?? "Your company"} · ${employee.employeeCode}${
          shift ? ` · ${shift.name}` : ""
        }`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink href="/passenger/corridor" variant="ghost">
              Live corridor
            </ButtonLink>
            <ButtonLink href="/passenger/trips" variant="outline">
              My trips &amp; boarding code
            </ButtonLink>
          </div>
        }
      />

      <MetricStrip>
        <MetricCell
          label="Bookings on record"
          value={n(history.length + upcoming.length)}
        />
        <MetricCell
          label="Completed journeys"
          value={n(completedCount)}
          tone="ok"
        />
        <MetricCell label="Upcoming" value={n(upcoming.length)} tone="live" />
        <MetricCell
          label="Pickup zone"
          value={employee.zone ?? "Not set"}
          tone={employee.zone ? "idle" : "caution"}
        />
      </MetricStrip>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          title="Book transport"
          subtitle="Home to office, office to home or an ad-hoc request"
          eyebrow="New request"
          className="lg:col-span-2"
        >
          <ActionForm
            action={createBookingAction}
            submitLabel="Request transport"
            resetOnSuccess
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Date of travel"
                name="bookingDate"
                type="date"
                required
                defaultValue={today}
              />
              <Field
                label="Trip direction"
                name="direction"
                options={[
                  { value: "home_to_office", label: "Home → Office (morning pickup)" },
                  { value: "office_to_home", label: "Office → Home (drop-off)" },
                  { value: "ad_hoc", label: "Ad-hoc / special request" },
                ]}
              />
              <Field
                label="Preferred pickup time"
                name="requestedTime"
                type="time"
                defaultValue={shift?.startTime ?? "07:00"}
                hint="Final time is confirmed after route planning."
              />
              <Field
                label="Repeat"
                name="recurring"
                options={[
                  { value: "none", label: "One time" },
                  { value: "daily", label: "Every working day" },
                  { value: "weekly", label: "Weekly" },
                  { value: "monthly", label: "Monthly" },
                ]}
              />
              <Field
                label="Preferred corridor (optional)"
                name="routeId"
                options={[
                  { value: "", label: "Let the planner choose" },
                  ...routeOptions.map((r) => ({ value: String(r.id), label: r.name })),
                ]}
                className="sm:col-span-2"
              />
              <Field
                label="Notes for the transport team"
                name="notes"
                rows={2}
                className="sm:col-span-2"
                placeholder="e.g. I have a client meeting and need the earliest pickup"
              />
            </div>
          </ActionForm>
          <div className="mt-3">
            <Notice tone="caution">
              Boarding codes are generated for every booking. Duplicate bookings for the
              same date and direction are rejected automatically.
            </Notice>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="My profile & saved addresses" eyebrow="Profile">
            <DefinitionList
              items={[
                { label: "Employee code", value: employee.employeeCode },
                { label: "Department", value: employee.department ?? "—" },
                { label: "Job title", value: employee.jobTitle ?? "—" },
                { label: "Work shift", value: shift ? `${shift.name}` : "—" },
                { label: "Home address", value: employee.homeAddress ?? "—" },
                {
                  label: "VIP entitlement",
                  value: employee.vip ? "Yes — priority pickup" : "Standard",
                },
              ]}
            />
            <div className="mt-4 border-t border-line pt-4">
              <ActionForm
                action={updateHomeAddressAction}
                submitLabel="Update home address"
              >
                <div className="space-y-3">
                  <Field
                    label="Home address"
                    name="homeAddress"
                    defaultValue={employee.homeAddress}
                    required
                  />
                  <Field
                    label="Pickup zone"
                    name="zone"
                    defaultValue={employee.zone}
                    placeholder="Dansoman"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Field
                      label="Latitude"
                      name="homeLat"
                      type="number"
                      step="0.0001"
                      defaultValue={employee.homeLat}
                    />
                    <Field
                      label="Longitude"
                      name="homeLng"
                      type="number"
                      step="0.0001"
                      defaultValue={employee.homeLng}
                    />
                  </div>
                </div>
              </ActionForm>
            </div>
          </Panel>

          <Panel title="Company transport policy" eyebrow="Policy">
            <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-ink-2">
              <li>One seat per employee per leg.</li>
              <li>Be at the pickup point 5 minutes before the confirmed time.</li>
              <li>
                Cancellations are accepted up to{" "}
                {agreement?.cancellationPolicyHours ?? 2} hours before departure.
              </li>
              <li>
                Pickup deviation target ±
                {agreement?.maxPickupDeviationMinutes ?? 10} minutes.
              </li>
              <li>
                Report safety concerns immediately — the SOS option is always available
                in the trip view.
              </li>
            </ul>
          </Panel>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Upcoming bookings" eyebrow="Bookings" padded={false}>
          <TableWrap>
            <THead>
              <TH>Reference</TH>
              <TH>Date</TH>
              <TH>Leg</TH>
              <TH>Pickup</TH>
              <TH>Status</TH>
              <TH align="right">Action</TH>
            </THead>
            <TBody>
              {upcoming.map((u) => (
                <TR key={u.booking.id}>
                  <TDPrimary>{u.booking.reference}</TDPrimary>
                  <TD>{dateOnly(u.booking.bookingDate)}</TD>
                  <TD>{humanize(u.booking.direction)}</TD>
                  <TD>
                    {u.booking.pickupTime ?? "to be confirmed"}
                    {u.vehicle ? (
                      <p className="text-[11.5px] text-ink-3">{u.vehicle.registrationNo}</p>
                    ) : null}
                    {u.driver ? (
                      <p className="text-[11.5px] text-ink-3">{u.driver.fullName}</p>
                    ) : null}
                  </TD>
                  <TD>
                    <StatusChip status={u.booking.status} />
                  </TD>
                  <TD align="right">
                    {["pending", "approved", "waitlisted"].includes(u.booking.status) ? (
                      <InlineActionForm
                        action={cancelOwnBookingAction}
                        hiddenFields={{ bookingId: u.booking.id }}
                        submitLabel="Cancel"
                        variant="ghost"
                        confirm="Cancel this booking?"
                      />
                    ) : (
                      <Link
                        href="/passenger/trips"
                        className="text-[12px] font-medium text-signal-text hover:underline"
                      >
                        Track
                      </Link>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          {!upcoming.length ? (
            <div className="p-4">
              <EmptyState
                title="No upcoming bookings"
                hint="Use the booking form to request transport."
              />
            </div>
          ) : null}
        </Panel>

        <Panel title="Trip history" eyebrow="History" padded={false}>
          <TableWrap>
            <THead>
              <TH>Reference</TH>
              <TH>Date</TH>
              <TH>Leg</TH>
              <TH>Status</TH>
            </THead>
            <TBody>
              {history.map((h) => (
                <TR key={h.booking.id}>
                  <TDPrimary>{h.booking.reference}</TDPrimary>
                  <TD>{dateOnly(h.booking.bookingDate)}</TD>
                  <TD>{humanize(h.booking.direction)}</TD>
                  <TD>
                    <StatusChip status={h.booking.status} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          {!history.length ? (
            <div className="p-4">
              <EmptyState title="No completed trips yet" />
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
