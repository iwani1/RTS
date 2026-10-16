import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { boardings, bookings, branches, drivers, employees, trips, vehicles } from "@/db/schema";
import { ActionForm, InlineActionForm } from "@/components/action-form";
import { MapCanvas, type MapPoint } from "@/components/live-map";
import {
  ButtonLink,
  DefinitionList,
  EmptyState,
  Field,
  Input,
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
  confirmBoardingAction,
  createIncidentAction,
  driverTripAction,
  markNoShowAction,
  recordPositionAction,
} from "@/app/actions/ops";
import { requireSection } from "@/lib/auth";
import { dateOnly, humanize, timeOnly } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DriverTripPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireSection("driverapp");
  const { id } = await params;
  const tripId = Number(id);
  if (!Number.isFinite(tripId)) notFound();

  const [driver] = await db
    .select()
    .from(drivers)
    .where(eq(drivers.userId, user.id))
    .limit(1);
  if (!driver) notFound();

  const [row] = await db
    .select({ trip: trips, vehicle: vehicles, branch: branches })
    .from(trips)
    .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
    .leftJoin(branches, eq(branches.id, trips.branchId))
    .where(eq(trips.id, tripId))
    .limit(1);
  if (!row || row.trip.driverId !== driver.id) notFound();

  const manifest = await db
    .select({ booking: bookings, employee: employees, boarding: boardings })
    .from(bookings)
    .innerJoin(employees, eq(employees.id, bookings.employeeId))
    .leftJoin(
      boardings,
      and(eq(boardings.bookingId, bookings.id), eq(boardings.tripId, tripId)),
    )
    .where(eq(bookings.tripId, tripId))
    .orderBy(asc(employees.zone), asc(employees.fullName));

  const points: MapPoint[] = [];
  if (row.branch?.lat && row.branch?.lng) {
    points.push({
      id: "office",
      lat: row.branch.lat,
      lng: row.branch.lng,
      label: row.branch.name,
      kind: "office",
      tone: "navy",
    });
  }
  manifest.forEach((m) => {
    if (m.employee.homeLat && m.employee.homeLng) {
      points.push({
        id: `e${m.employee.id}`,
        lat: m.employee.homeLat,
        lng: m.employee.homeLng,
        label: m.employee.fullName,
        kind: "stop",
        tone: m.boarding?.otpVerified ? "teal" : "amber",
      });
    }
  });

  const boarded = manifest.filter((m) => m.boarding?.otpVerified).length;
  const noShows = manifest.filter((m) => m.boarding?.noShow).length;

  return (
    <div>
      <PageHeader
        eyebrow="Driver"
        title={`Trip sheet ${row.trip.reference}`}
        subtitle={`${dateOnly(row.trip.tripDate)} · ${humanize(row.trip.direction)} · ${timeOnly(
          row.trip.scheduledDeparture,
        )} departure`}
        actions={
          <ButtonLink href="/driver" variant="outline">
            Back to schedule
          </ButtonLink>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Journey controls" eyebrow="Trip">
          <DefinitionList
            items={[
              { label: "Status", value: <StatusChip status={row.trip.status} /> },
              { label: "Vehicle", value: row.vehicle?.registrationNo ?? "—" },
              { label: "Boarded", value: `${boarded}/${manifest.length}` },
              { label: "No-shows", value: String(noShows) },
            ]}
          />

          <div className="mt-4 flex flex-wrap gap-2">
            <InlineActionForm
              action={driverTripAction}
              hiddenFields={{ tripId, op: "start" }}
              submitLabel="Start journey"
              variant="primary"
            />
            <InlineActionForm
              action={driverTripAction}
              hiddenFields={{ tripId, op: "complete" }}
              submitLabel="Complete journey"
              variant="secondary"
            />
            <InlineActionForm
              action={driverTripAction}
              hiddenFields={{ tripId, op: "delay" }}
              submitLabel="Report traffic delay"
              variant="ghost"
            />
          </div>

          <div className="mt-4 space-y-3 border-t border-line pt-4">
            <p className="eyebrow">Report a problem</p>
            <InlineActionForm
              action={createIncidentAction}
              hiddenFields={{ tripId, type: "breakdown", severity: "high" }}
              submitLabel="Vehicle breakdown"
              variant="danger"
              confirm="Report a breakdown for this trip? Dispatch will be alerted immediately."
            />
            <InlineActionForm
              action={createIncidentAction}
              hiddenFields={{ tripId, type: "accident", severity: "critical" }}
              submitLabel="Accident / SOS"
              variant="danger"
              confirm="Send an emergency alert to dispatch?"
            />
            <ActionForm action={createIncidentAction} submitLabel="Other report" resetOnSuccess>
              <input type="hidden" name="tripId" value={tripId} />
              <div className="space-y-3">
                <Field
                  label="Type"
                  name="type"
                  options={["delay", "no_show", "safety", "complaint"].map((t) => ({
                    value: t,
                    label: humanize(t),
                  }))}
                />
                <Field
                  label="Severity"
                  name="severity"
                  options={["low", "medium", "high", "critical"].map((s) => ({
                    value: s,
                    label: humanize(s),
                  }))}
                />
                <Field label="Location" name="location" />
                <Field label="Description" name="description" rows={2} required />
              </div>
            </ActionForm>
          </div>
        </Panel>

        <Panel
          title="Passenger manifest & boarding"
          eyebrow="Manifest"
          className="lg:col-span-2"
          padded={false}
        >
          <TableWrap>
            <THead>
              <TH>Passenger</TH>
              <TH>Zone / pickup</TH>
              <TH>Contact</TH>
              <TH align="right">Boarding code</TH>
              <TH>State</TH>
              <TH>Verify boarding</TH>
            </THead>
            <TBody>
              {manifest.map((m) => (
                <TR key={m.booking.id}>
                  <TDPrimary>
                    <p>{m.employee.fullName}</p>
                    <p className="text-[11.5px] font-normal text-ink-3">
                      {m.employee.employeeCode}
                    </p>
                  </TDPrimary>
                  <TD>
                    {m.employee.zone ?? "—"}
                    <p className="text-[11.5px] text-ink-3">{m.booking.pickupTime ?? "—"}</p>
                  </TD>
                  <TD>{m.employee.phone ?? "—"}</TD>
                  <TD align="right">
                    <span className="numeric text-[13px] font-semibold tracking-[0.14em] text-signal-text">
                      {m.booking.otpCode ?? "—"}
                    </span>
                  </TD>
                  <TD>
                    <StatusChip
                      status={
                        m.boarding
                          ? m.boarding.noShow
                            ? "no_show"
                            : "in_progress"
                          : m.booking.status
                      }
                    />
                  </TD>
                  <TD>
                    <div className="flex flex-col gap-2">
                      <ActionForm
                        action={confirmBoardingAction}
                        submitLabel="Verify & board"
                      >
                        <input type="hidden" name="bookingId" value={m.booking.id} />
                        <Input
                          name="otp"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={6}
                          placeholder="6-digit code"
                          className="w-32"
                        />
                      </ActionForm>
                      {!m.boarding ? (
                        <InlineActionForm
                          action={markNoShowAction}
                          hiddenFields={{ bookingId: m.booking.id }}
                          submitLabel="Mark no-show"
                          variant="ghost"
                          confirm="Record a no-show for this passenger?"
                        />
                      ) : null}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          {!manifest.length ? (
            <div className="p-4">
              <EmptyState title="No passengers on this trip" />
            </div>
          ) : null}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Corridor map" eyebrow="Route" className="lg:col-span-2">
          {points.length ? (
            <MapCanvas points={points} height={300} />
          ) : (
            <EmptyState title="No geocoded stops" />
          )}
          <div className="mt-3">
            <Notice tone="caution">
              Navigation opens the device map app. Configure a mapping provider key to
              embed turn-by-turn navigation.
            </Notice>
          </div>
          <a
            href="https://www.google.com/maps/dir/?api=1"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-[12px] font-medium text-signal-text underline"
          >
            Open navigation
          </a>
        </Panel>

        <Panel
          title="Share position"
          subtitle="Works offline — queued locally, synced later"
          eyebrow="Tracking"
        >
          <Notice tone="caution">
            Position reports are queued in browser storage when the device is offline and
            replayed to <code className="mx-1 rounded bg-surface-2 px-1">/api/driver/sync</code>{" "}
            when connectivity returns. Duplicate submissions are ignored.
          </Notice>
          <ActionForm
            action={recordPositionAction}
            submitLabel="Send position"
            className="mt-3"
          >
            <input type="hidden" name="tripId" value={tripId} />
            <div className="grid grid-cols-3 gap-2">
              <Field label="Lat" name="lat" type="number" step="0.0001" defaultValue={5.61} />
              <Field
                label="Lng"
                name="lng"
                type="number"
                step="0.0001"
                defaultValue={-0.19}
              />
              <Field label="km/h" name="speedKph" type="number" defaultValue={28} />
            </div>
          </ActionForm>
          <p className="mt-2 text-[12px] text-ink-3">
            Location is only collected while a journey is active, in line with the consent
            notice shown at login.
          </p>
        </Panel>
      </div>

      <p className="mt-4 text-[12px] text-ink-3">
        Need a passenger&apos;s contact? Phone numbers are visible to the assigned driver
        only for the duration of the duty —{" "}
        <Link href="/settings" className="underline">
          review the privacy policy
        </Link>
        .
      </p>
    </div>
  );
}
