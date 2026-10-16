import Link from "next/link";
import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  drivers,
  employees,
  gpsEvents,
  locationConsents,
  trackingShares,
  trips,
  vehicles,
} from "@/db/schema";
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
import { revokeShareAction, shareTripAction } from "@/app/actions/platform";
import { requireSection } from "@/lib/auth";
import { dateOnly, humanize, n, timeOnly } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * The corridor.
 *
 * A passenger can see how busy their vehicle is and where it is, and they can
 * share that with the colleagues travelling on the same run. What is shared
 * is the **corridor** — occupancy and position — never who is on board. The
 * share code is short-lived, revocable, and only works for someone who
 * enters it deliberately.
 */
export default async function CorridorPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string; message?: string }>;
}) {
  const user = await requireSection("passenger");
  const params = await searchParams;

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.userId, user.id))
    .limit(1);

  if (!employee) {
    return (
      <div>
        <PageHeader eyebrow="Passenger" title="Corridor" />
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

  // A share code entered by this passenger opens somebody else's corridor.
  let sharedTripId: number | null = null;
  let sharedBy: string | null = null;
  if (params.code) {
    const [share] = await db
      .select({ share: trackingShares, name: employees.fullName })
      .from(trackingShares)
      .innerJoin(employees, eq(employees.id, trackingShares.employeeId))
      .where(
        and(
          eq(trackingShares.shareCode, params.code.toUpperCase()),
          isNull(trackingShares.revokedAt),
          gt(trackingShares.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (share) {
      sharedTripId = share.share.tripId;
      sharedBy = share.name;
    }
  }

  // The passenger's own upcoming trips.
  const ownBookings = await db
    .select({ booking: bookings, trip: trips })
    .from(bookings)
    .leftJoin(trips, eq(trips.id, bookings.tripId))
    .where(eq(bookings.employeeId, employee.id))
    .orderBy(desc(bookings.bookingDate), desc(bookings.id))
    .limit(12);

  const ownTrips = ownBookings
    .map((row) => row.trip)
    .filter((trip): trip is NonNullable<typeof trip> => Boolean(trip));
  const activeTrip =
    ownTrips.find((trip) => ["dispatching", "in_progress"].includes(trip.status)) ??
    ownTrips[0];

  // The trips this passenger may share: the ones they are booked on.
  const shareable = ownTrips.filter((trip) =>
    ["scheduled", "dispatching", "in_progress"].includes(trip.status),
  );

  // The passenger's own live shares.
  const myShares = await db
    .select()
    .from(trackingShares)
    .where(
      and(
        eq(trackingShares.employeeId, employee.id),
        isNull(trackingShares.revokedAt),
        gt(trackingShares.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(trackingShares.createdAt));

  const [consent] = await db
    .select()
    .from(locationConsents)
    .where(eq(locationConsents.userId, user.id))
    .orderBy(desc(locationConsents.grantedAt))
    .limit(1);
  const hasConsent = Boolean(consent?.granted);

  // The trip being looked at: the shared one, or the passenger's own.
  const focusTripId = sharedTripId ?? activeTrip?.id ?? null;
  let focusTrip: typeof trips.$inferSelect | null = null;
  let occupancy = { booked: 0, capacity: 0, onBoard: 0 };

  if (focusTripId) {
    const [row] = await db.select().from(trips).where(eq(trips.id, focusTripId)).limit(1);
    focusTrip = row ?? null;
    if (row) {
      const bookedRows = await db
        .select({ id: bookings.id })
        .from(bookings)
        .where(
          and(
            eq(bookings.tripId, row.id),
            inArray(bookings.status, ["approved", "assigned", "in_progress", "completed"]),
          ),
        );
      const boardedRows = await db
        .select({ id: bookings.id })
        .from(bookings)
        .where(
          and(
            eq(bookings.tripId, row.id),
            eq(bookings.status, "in_progress"),
          ),
        );
      occupancy = {
        booked: bookedRows.length,
        capacity: n(row.capacity),
        onBoard: boardedRows.length,
      };
    }
  }

  // The live position of the vehicle on the focused trip.
  const points: MapPoint[] = [];
  if (focusTrip?.vehicleId) {
    const [fix] = await db
      .select()
      .from(gpsEvents)
      .where(eq(gpsEvents.vehicleId, focusTrip.vehicleId))
      .orderBy(desc(gpsEvents.recordedAt))
      .limit(1);
    if (fix) {
      points.push({
        id: String(focusTrip.vehicleId),
        lat: fix.lat,
        lng: fix.lng,
        label: focusTrip.reference,
        kind: "vehicle",
        tone: "signal",
      });
    }
  }

  const [vehicle] = focusTrip?.vehicleId
    ? await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.id, focusTrip.vehicleId))
        .limit(1)
    : [null];
  const [driver] = focusTrip?.driverId
    ? await db
        .select()
        .from(drivers)
        .where(eq(drivers.id, focusTrip.driverId))
        .limit(1)
    : [null];

  const load = occupancy.capacity
    ? Math.round((occupancy.booked / occupancy.capacity) * 100)
    : 0;

  return (
    <div>
      <PageHeader
        eyebrow="Passenger"
        title="Corridor"
        subtitle="How busy your vehicle is, where it is, and the colleagues you are travelling with."
        actions={
          <ButtonLink href="/passenger/trips" variant="outline" size="sm">
            My trips
          </ButtonLink>
        }
      />

      {params.error ? (
        <Notice tone="critical" className="mb-4 text-[12.5px]">
          {params.error}
        </Notice>
      ) : null}
      {params.message ? (
        <Notice tone="ok" className="mb-4 text-[12.5px]">
          {params.message}
        </Notice>
      ) : null}

      {sharedTripId && !focusTrip ? (
        <Notice tone="caution" className="mb-4 text-[12.5px]">
          That share code is not valid, or it has expired. Ask your colleague for a
          new one.
        </Notice>
      ) : null}

      {sharedTripId && focusTrip ? (
        <Notice tone="ok" className="mb-4 text-[12.5px]">
          You are following a corridor shared by {sharedBy}. You can see how busy the
          vehicle is and where it is — never who is on board.
        </Notice>
      ) : null}

      <MetricStrip className="mt-4">
        <MetricCell label="Passengers booked" value={String(occupancy.booked)} />
        <MetricCell label="Seat capacity" value={String(occupancy.capacity)} />
        <MetricCell
          label="Load"
          value={occupancy.capacity ? `${load}%` : "—"}
          tone={load > 85 ? "caution" : undefined}
        />
        <MetricCell label="Boarded" value={String(occupancy.onBoard)} />
        <MetricCell
          label="Departs"
          value={focusTrip ? timeOnly(focusTrip.scheduledDeparture) : "—"}
        />
      </MetricStrip>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel eyebrow="Live" title="Where the vehicle is" padded={false}>
          {points.length ? (
            <MapCanvas points={points} className="h-[340px]" />
          ) : (
            <EmptyState
              title="No position yet"
              hint="The vehicle reports its position when the trip goes out."
            />
          )}
        </Panel>

        <Panel eyebrow="Trip" title={focusTrip ? focusTrip.reference : "No trip selected"}>
          {focusTrip ? (
            <DefinitionList
              items={[
                { label: "Date", value: dateOnly(focusTrip.tripDate) },
                { label: "Departs", value: timeOnly(focusTrip.scheduledDeparture) },
                { label: "Arrives", value: timeOnly(focusTrip.scheduledArrival) },
                { label: "Status", value: humanize(focusTrip.status) },
                { label: "Vehicle", value: vehicle?.registrationNo ?? "Not assigned" },
                { label: "Driver", value: driver?.fullName ?? "Not assigned" },
                {
                  label: "Load",
                  value: `${occupancy.booked} of ${occupancy.capacity} seats (${load}%)`,
                },
              ]}
            />
          ) : (
            <EmptyState
              title="Nothing to show"
              hint="Book a trip and it will appear here with its live position."
            />
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel
          eyebrow="Sharing"
          title="Share your corridor"
          subtitle="Give a colleague a code and they can see how busy the vehicle is. The code expires in six hours and you can revoke it at any time."
        >
          {!hasConsent ? (
            <Notice tone="caution" className="mb-4 text-[12px]">
              Location sharing is switched off for your account. Open Settings to
              grant it before sharing a corridor.
            </Notice>
          ) : null}

          {shareable.length === 0 ? (
            <EmptyState
              title="No trip to share"
              hint="Share a corridor once you are booked onto a run."
            />
          ) : (
            <ActionForm action={shareTripAction} submitLabel="Create a share code">
              <Field
                label="Trip"
                name="tripId"
                type="number"
                required
                placeholder="Trip id"
                hint={shareable.map((trip) => `${trip.id}: ${trip.reference}`).join(" · ")}
              />
            </ActionForm>
          )}

          {myShares.length ? (
            <div className="mt-4">
              <p className="mb-2 text-[11.5px] font-medium uppercase tracking-[0.08em] text-ink-3">
                Active codes
              </p>
              <ul className="divide-y divide-line">
                {myShares.map((share) => (
                  <li
                    key={share.id}
                    className="flex items-center justify-between gap-3 py-2 text-[12.5px]"
                  >
                    <span className="numeric font-medium text-ink">{share.shareCode}</span>
                    <span className="numeric text-ink-3">
                      until {timeOnly(share.expiresAt)}
                    </span>
                    <InlineActionForm
                      action={revokeShareAction}
                      submitLabel="Revoke"
                      variant="danger"
                      hiddenFields={{ id: share.id }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Panel>

        <Panel
          eyebrow="Follow"
          title="Follow a colleague"
          subtitle="Enter a share code to see the corridor they are on."
        >
          <form method="get" className="flex flex-wrap items-end gap-2">
            <div className="min-w-[160px] flex-1">
              <Field label="Share code" name="code" placeholder="A1B2C3" required />
            </div>
            <button
              type="submit"
              className="h-9 rounded-full bg-signal px-4 font-display text-[13.5px] font-semibold text-signal-ink transition-colors hover:bg-signal-press"
            >
              Follow
            </button>
          </form>

          <div className="mt-4">
            <p className="mb-2 text-[11.5px] font-medium uppercase tracking-[0.08em] text-ink-3">
              Who is on my trips
            </p>
            {ownBookings.length === 0 ? (
              <EmptyState title="No bookings yet" hint="Your trips will appear here." />
            ) : (
              <TableWrap>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Trip</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {ownBookings.slice(0, 6).map((row) => (
                    <TR key={row.booking.id}>
                      <TD>{dateOnly(row.booking.bookingDate)}</TD>
                      <TDPrimary>
                        {row.trip ? (
                          <Link href={`/trips/${row.trip.id}`} className="hover:underline">
                            {row.trip.reference}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TDPrimary>
                      <TD>
                        <StatusChip status={row.booking.status} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </TableWrap>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
