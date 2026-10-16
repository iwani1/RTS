import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bookings, drivers, employees, gpsEvents, trips, vehicles } from "@/db/schema";
import { ActionForm, InlineActionForm } from "@/components/action-form";
import { MapCanvas, type MapPoint } from "@/components/live-map";
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
  createIncidentAction,
  submitFeedbackAction,
} from "@/app/actions/ops";
import { requireSection } from "@/lib/auth";
import { dateOnly, humanize, minutesBetween, n, timeOnly } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PassengerTripsPage() {
  const user = await requireSection("passenger");
  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.userId, user.id))
    .limit(1);

  if (!employee) {
    return (
      <div>
        <PageHeader eyebrow="Passenger" title="My trips" />
        <Panel title="No employee record linked">
          <p className="text-[13px] text-ink-2">
            Ask HR to link your account, then return here.
          </p>
          <div className="mt-4">
            <ButtonLink href="/passenger">Back</ButtonLink>
          </div>
        </Panel>
      </div>
    );
  }

  const rows = await db
    .select({ booking: bookings, trip: trips, vehicle: vehicles, driver: drivers })
    .from(bookings)
    .leftJoin(trips, eq(trips.id, bookings.tripId))
    .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
    .leftJoin(drivers, eq(drivers.id, trips.driverId))
    .where(eq(bookings.employeeId, employee.id))
    .orderBy(desc(bookings.bookingDate), desc(bookings.id))
    .limit(30);

  const active = rows.filter((r) =>
    r.trip ? ["dispatching", "in_progress", "delayed"].includes(r.trip.status) : false,
  );
  const upcoming = rows.filter(
    (r) => r.booking.status === "assigned" || r.booking.status === "approved",
  );
  const completed = rows.filter((r) =>
    ["completed", "no_show", "cancelled"].includes(r.booking.status),
  );

  const activeTripIds = active.map((a) => a.trip!.id);
  const positions = activeTripIds.length
    ? await db
        .select({
          tripId: gpsEvents.tripId,
          lat: gpsEvents.lat,
          lng: gpsEvents.lng,
          recordedAt: gpsEvents.recordedAt,
        })
        .from(gpsEvents)
        .where(inArray(gpsEvents.tripId, activeTripIds))
        .orderBy(desc(gpsEvents.recordedAt))
        .limit(60)
    : [];

  const points: MapPoint[] = positions.slice(0, 1).map((p) => ({
    id: `p${p.tripId}`,
    lat: p.lat,
    lng: p.lng,
    label: "Your vehicle",
    kind: "vehicle",
    tone: "teal",
  }));
  if (employee.homeLat && employee.homeLng) {
    points.push({
      id: "home",
      lat: employee.homeLat,
      lng: employee.homeLng,
      label: "Home pickup",
      kind: "stop",
      tone: "amber",
    });
  }

  const completedCount = completed.filter((c) => c.booking.status === "completed").length;
  const missedCount = completed.length - completedCount;

  return (
    <div>
      <PageHeader
        eyebrow="Passenger"
        title="My trips & boarding"
        subtitle="Live tracking, driver details, your secure boarding code and trip history."
        actions={
          <ButtonLink href="/passenger" variant="outline">
            Book transport
          </ButtonLink>
        }
      />

      <MetricStrip>
        <MetricCell
          label="Active journey"
          value={active.length ? "Yes" : "None"}
          tone={active.length ? "live" : "idle"}
        />
        <MetricCell label="Confirmed upcoming" value={n(upcoming.length)} />
        <MetricCell label="Completed" value={n(completedCount)} tone="ok" />
        <MetricCell
          label="Cancelled / no-show"
          value={n(missedCount)}
          tone={missedCount > 0 ? "caution" : "idle"}
        />
      </MetricStrip>

      {active.length ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {active.map((a) => {
            const eta = a.trip?.scheduledArrival
              ? minutesBetween(a.trip.scheduledArrival, new Date())
              : 0;
            return (
              <Panel
                key={a.booking.id}
                title="Live journey"
                subtitle={`${a.trip!.reference} · ${humanize(a.trip!.direction)}`}
                eyebrow="In progress"
              >
                <DefinitionList
                  items={[
                    {
                      label: "Vehicle",
                      value: a.vehicle
                        ? `${a.vehicle.registrationNo} · ${a.vehicle.make} ${a.vehicle.model}`
                        : "—",
                    },
                    { label: "Driver", value: a.driver ? `${a.driver.fullName}` : "—" },
                    { label: "Driver contact", value: a.driver?.phone ?? "—" },
                    { label: "Departed", value: timeOnly(a.trip!.actualDeparture) },
                    {
                      label: "Scheduled arrival",
                      value: timeOnly(a.trip!.scheduledArrival),
                    },
                    { label: "Status", value: <StatusChip status={a.trip!.status} /> },
                  ]}
                />
                <p className="mt-3 text-[12.5px] text-ink-2">
                  {eta > 0
                    ? `Running about ${eta} minute(s) behind the planned arrival.`
                    : "On schedule."}
                </p>
                <div className="mt-3">
                  <InlineActionForm
                    action={createIncidentAction}
                    hiddenFields={{
                      tripId: a.trip!.id,
                      type: "sos",
                      severity: "critical",
                    }}
                    submitLabel="Raise SOS"
                    variant="danger"
                    confirm="Send an SOS alert to dispatch for this trip?"
                  />
                </div>
              </Panel>
            );
          })}
          <Panel
            title="Vehicle position"
            eyebrow="Tracking"
            className="lg:col-span-2"
          >
            {points.length ? (
              <MapCanvas points={points} height={300} />
            ) : (
              <EmptyState title="No position reported yet" />
            )}
            <div className="mt-3">
              <Notice tone="caution">
                Live tracking shows the last position the driver shared. Configure a
                mapping provider key for a road basemap and turn-by-turn context.
              </Notice>
            </div>
          </Panel>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          title="Boarding codes & upcoming trips"
          eyebrow="Manifest"
          className="lg:col-span-2"
          padded={false}
        >
          <TableWrap>
            <THead>
              <TH>Trip</TH>
              <TH>Date</TH>
              <TH>Pickup</TH>
              <TH>Vehicle &amp; driver</TH>
              <TH align="right">Boarding code</TH>
              <TH>Status</TH>
            </THead>
            <TBody>
              {[...active, ...upcoming].map((r) => (
                <TR key={r.booking.id}>
                  <TDPrimary>{r.trip?.reference ?? "awaiting assignment"}</TDPrimary>
                  <TD>{dateOnly(r.booking.bookingDate)}</TD>
                  <TD>
                    {r.booking.pickupTime ?? "to be confirmed"}
                    <p className="text-[11.5px] text-ink-3">
                      {r.booking.pickupAddress?.slice(0, 26) ?? "—"}
                    </p>
                  </TD>
                  <TD>
                    {r.vehicle?.registrationNo ?? "—"}
                    <p className="text-[11.5px] text-ink-3">{r.driver?.fullName ?? "—"}</p>
                  </TD>
                  <TD align="right">
                    <span className="numeric text-[15px] font-semibold tracking-[0.2em] text-signal-text">
                      {r.booking.otpCode ?? "—"}
                    </span>
                  </TD>
                  <TD>
                    <StatusChip status={r.booking.status} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          {!active.length && !upcoming.length ? (
            <div className="p-4">
              <EmptyState title="No upcoming trips" />
            </div>
          ) : null}
        </Panel>

        <div className="space-y-4">
          <Panel title="Cancel an eligible booking" eyebrow="Change plan">
            <ActionForm action={cancelOwnBookingAction} submitLabel="Cancel booking">
              <Field
                label="Booking"
                name="bookingId"
                required
                options={[...active, ...upcoming]
                  .filter((r) =>
                    ["pending", "approved", "waitlisted"].includes(r.booking.status),
                  )
                  .map((r) => ({
                    value: String(r.booking.id),
                    label: `${r.booking.reference} · ${dateOnly(r.booking.bookingDate)}`,
                  }))}
              />
              <div className="mt-3">
                <Field
                  label="Reason"
                  name="reason"
                  rows={2}
                  placeholder="Travelling, changed shift…"
                />
              </div>
            </ActionForm>
          </Panel>

          <Panel
            title="Rate a journey"
            subtitle="Feedback reaches the transport team"
            eyebrow="Feedback"
          >
            <ActionForm
              action={submitFeedbackAction}
              submitLabel="Submit feedback"
              resetOnSuccess
            >
              <div className="space-y-3">
                <Field
                  label="Trip"
                  name="tripId"
                  options={[
                    { value: "", label: "General feedback" },
                    ...completed
                      .filter((c) => c.trip)
                      .map((c) => ({
                        value: String(c.trip!.id),
                        label: `${c.trip!.reference} · ${dateOnly(c.booking.bookingDate)}`,
                      })),
                  ]}
                />
                <Field
                  label="Type"
                  name="category"
                  options={[
                    { value: "feedback", label: "Feedback" },
                    { value: "complaint", label: "Complaint" },
                  ]}
                />
                <Field
                  label="Rating"
                  name="rating"
                  options={["5", "4", "3", "2", "1"].map((r) => ({
                    value: r,
                    label: `${r} star${r === "1" ? "" : "s"}`,
                  }))}
                />
                <Field label="Comments" name="comments" rows={3} required />
              </div>
            </ActionForm>
          </Panel>

          <Panel title="Emergency contacts" eyebrow="Safety">
            <ul className="space-y-1.5 text-[12.5px] text-ink-2">
              <li>Transport control room: +233 30 200 1122</li>
              <li>Dispatcher on duty: +233 24 111 0003</li>
              <li>
                <Link
                  href="/incidents"
                  className="text-signal-text underline"
                >
                  Report a safety concern
                </Link>
              </li>
            </ul>
          </Panel>
        </div>
      </div>

      <Panel className="mt-4" title="Completed trips" eyebrow="History" padded={false}>
        <TableWrap>
          <THead>
            <TH>Reference</TH>
            <TH>Date</TH>
            <TH>Leg</TH>
            <TH>Trip</TH>
            <TH>Status</TH>
          </THead>
          <TBody>
            {completed.map((c) => (
              <TR key={c.booking.id}>
                <TDPrimary>{c.booking.reference}</TDPrimary>
                <TD>{dateOnly(c.booking.bookingDate)}</TD>
                <TD>{humanize(c.booking.direction)}</TD>
                <TD>{c.trip?.reference ?? "—"}</TD>
                <TD>
                  <StatusChip status={c.booking.status} />
                </TD>
              </TR>
            ))}
          </TBody>
        </TableWrap>
        {!completed.length ? (
          <div className="p-4">
            <EmptyState title="No completed trips yet" />
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
