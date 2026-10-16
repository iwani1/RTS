import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  branches,
  companies,
  drivers,
  employees,
  gpsEvents,
  incidents,
  routes,
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
  assignResourcesAction,
  moveBookingAction,
  recordPositionAction,
  updateTripStatusAction,
} from "@/app/actions/ops";
import { companyScope, requireSection } from "@/lib/auth";
import { dateOnly, humanize, minutesBetween, money, timeOnly } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireSection("trips");
  const scope = companyScope(user);
  const { id } = await params;
  const tripId = Number(id);
  if (!Number.isFinite(tripId)) notFound();

  const [row] = await db
    .select({
      trip: trips,
      company: companies,
      route: routes,
      vehicle: vehicles,
      driver: drivers,
      branch: branches,
    })
    .from(trips)
    .innerJoin(companies, eq(companies.id, trips.companyId))
    .leftJoin(routes, eq(routes.id, trips.routeId))
    .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
    .leftJoin(drivers, eq(drivers.id, trips.driverId))
    .leftJoin(branches, eq(branches.id, trips.branchId))
    .where(eq(trips.id, tripId))
    .limit(1);
  if (!row) notFound();
  if (scope && row.trip.companyId !== scope) notFound();

  const manifest = await db
    .select({ booking: bookings, employee: employees })
    .from(bookings)
    .innerJoin(employees, eq(employees.id, bookings.employeeId))
    .where(eq(bookings.tripId, tripId))
    .orderBy(asc(employees.zone), asc(employees.fullName));

  const track = await db
    .select()
    .from(gpsEvents)
    .where(eq(gpsEvents.tripId, tripId))
    .orderBy(desc(gpsEvents.recordedAt))
    .limit(40);
  const tripIncidents = await db
    .select()
    .from(incidents)
    .where(eq(incidents.tripId, tripId))
    .orderBy(desc(incidents.reportedAt));

  const vehicleOptions = await db
    .select()
    .from(vehicles)
    .orderBy(asc(vehicles.registrationNo));
  const driverOptions = await db
    .select()
    .from(drivers)
    .orderBy(asc(drivers.fullName));
  const otherTrips = await db
    .select({
      id: trips.id,
      reference: trips.reference,
      capacity: trips.capacity,
      bookedSeats: trips.bookedSeats,
      status: trips.status,
      tripDate: trips.tripDate,
    })
    .from(trips)
    .where(and(eq(trips.tripDate, row.trip.tripDate), eq(trips.companyId, row.trip.companyId)))
    .limit(20);

  const unassigned = await db
    .select({ booking: bookings, employee: employees })
    .from(bookings)
    .innerJoin(employees, eq(employees.id, bookings.employeeId))
    .where(
      and(
        eq(bookings.companyId, row.trip.companyId),
        eq(bookings.bookingDate, row.trip.tripDate),
      ),
    )
    .limit(40);

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
  for (const m of manifest) {
    if (m.employee.homeLat && m.employee.homeLng) {
      points.push({
        id: `e${m.employee.id}`,
        lat: m.employee.homeLat,
        lng: m.employee.homeLng,
        label: m.employee.fullName,
        kind: "stop",
        tone: m.booking.status === "completed" ? "teal" : "amber",
      });
    }
  }
  for (const g of [...track].reverse().slice(-1)) {
    points.push({
      id: "live",
      lat: g.lat,
      lng: g.lng,
      label: "Vehicle",
      kind: "vehicle",
      tone: "rose",
    });
  }

  const delayMinutes = row.trip.actualArrival
    ? minutesBetween(row.trip.actualArrival, row.trip.scheduledArrival)
    : 0;

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title={`Trip ${row.trip.reference}`}
        subtitle={`${row.company.name} · ${humanize(row.trip.direction)} · ${dateOnly(
          row.trip.tripDate,
        )}`}
        actions={
          <>
            <ButtonLink href="/trips" variant="outline">
              All trips
            </ButtonLink>
            <ButtonLink
              href={`/api/reports/pdf?type=manifest&tripId=${row.trip.id}`}
              variant="ghost"
            >
              Passenger manifest PDF
            </ButtonLink>
            <ButtonLink href="/dispatch" variant="signal">
              Dispatch board
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Trip record" eyebrow="Record">
          <DefinitionList
            items={[
              { label: "Status", value: <StatusChip status={row.trip.status} /> },
              { label: "Route", value: row.route?.name ?? "—" },
              { label: "Branch", value: row.branch?.name ?? "—" },
              {
                label: "Scheduled departure",
                value: timeOnly(row.trip.scheduledDeparture),
              },
              { label: "Scheduled arrival", value: timeOnly(row.trip.scheduledArrival) },
              { label: "Actual departure", value: timeOnly(row.trip.actualDeparture) },
              { label: "Actual arrival", value: timeOnly(row.trip.actualArrival) },
              { label: "Delay vs plan", value: `${delayMinutes > 0 ? delayMinutes : 0} min` },
              { label: "Seats", value: `${row.trip.bookedSeats} / ${row.trip.capacity}` },
              {
                label: "Planned distance",
                value: `${Number(row.trip.plannedKm ?? 0)} km`,
              },
              {
                label: "Vehicle",
                value: row.vehicle
                  ? `${row.vehicle.registrationNo} · ${row.vehicle.make} ${row.vehicle.model}`
                  : "Not assigned",
              },
              {
                label: "Driver",
                value: row.driver ? `${row.driver.fullName} · ${row.driver.phone}` : "Not assigned",
              },
              { label: "Notes", value: row.trip.notes ?? "—" },
            ]}
          />
        </Panel>

        <Panel title="Route & live position" eyebrow="Map" className="lg:col-span-2">
          {points.length ? (
            <MapCanvas points={points} height={320} />
          ) : (
            <EmptyState
              title="No geocoded points for this trip"
              hint="Add latitude/longitude to employee home addresses to visualise the corridor."
            />
          )}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="eyebrow mb-2">Assign or reassign resources</p>
              <ActionForm action={assignResourcesAction} submitLabel="Assign">
                <input type="hidden" name="tripId" value={row.trip.id} />
                <div className="space-y-3">
                  <Field
                    label="Vehicle"
                    name="vehicleId"
                    options={[
                      ...(row.vehicle
                        ? [
                            {
                              value: String(row.vehicle.id),
                              label: `Keep: ${row.vehicle.registrationNo}`,
                            },
                          ]
                        : [{ value: "", label: "Not assigned" }]),
                      ...vehicleOptions
                        .filter(
                          (v) =>
                            v.id !== row.vehicle?.id &&
                            !["under_maintenance", "out_of_service"].includes(v.status),
                        )
                        .map((v) => ({
                          value: String(v.id),
                          label: `${v.registrationNo} · ${v.capacity} seats · ${v.status.replace(
                            "_",
                            " ",
                          )}`,
                        })),
                    ]}
                  />
                  <Field
                    label="Driver"
                    name="driverId"
                    options={[
                      ...(row.driver
                        ? [{ value: String(row.driver.id), label: `Keep: ${row.driver.fullName}` }]
                        : [{ value: "", label: "Not assigned" }]),
                      ...driverOptions
                        .filter((d) => d.id !== row.driver?.id && d.status !== "unavailable")
                        .map((d) => ({
                          value: String(d.id),
                          label: `${d.fullName} · ${d.status.replace("_", " ")}`,
                        })),
                    ]}
                  />
                </div>
              </ActionForm>
            </div>
            <div>
              <p className="eyebrow mb-2">Trip lifecycle</p>
              <div className="flex flex-wrap gap-2">
                {["dispatching", "in_progress", "delayed", "completed", "cancelled"].map(
                  (s) => (
                    <InlineActionForm
                      key={s}
                      action={updateTripStatusAction}
                      hiddenFields={{ tripId: row.trip.id, status: s }}
                      submitLabel={humanize(s)}
                      variant={s === "cancelled" ? "danger" : "secondary"}
                      confirm={
                        s === "cancelled"
                          ? "Cancel this trip and release all passengers?"
                          : undefined
                      }
                    />
                  ),
                )}
              </div>
              <div className="mt-4 rounded-[8px] border border-line bg-surface-2 p-3">
                <p className="eyebrow mb-2">Record a GPS position (demo)</p>
                <Notice tone="caution">
                  Manual position entry stands in for a vehicle telematics feed until a
                  provider key is configured.
                </Notice>
                <ActionForm
                  action={recordPositionAction}
                  submitLabel="Log position"
                  className="mt-2"
                >
                  <input type="hidden" name="tripId" value={row.trip.id} />
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Lat" name="lat" type="number" step="0.0001" defaultValue={5.6} />
                    <Field
                      label="Lng"
                      name="lng"
                      type="number"
                      step="0.0001"
                      defaultValue={-0.19}
                    />
                    <Field label="Speed" name="speedKph" type="number" defaultValue={32} />
                  </div>
                </ActionForm>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          title="Passenger manifest"
          eyebrow="Manifest"
          className="lg:col-span-2"
          padded={false}
        >
          <TableWrap>
            <THead>
              <TH>Passenger</TH>
              <TH>Zone</TH>
              <TH>Pickup</TH>
              <TH>Contact</TH>
              <TH>Booking</TH>
              <TH align="right">Boarding code</TH>
              <TH>Status</TH>
            </THead>
            <TBody>
              {manifest.map((m) => (
                <TR key={m.booking.id}>
                  <TDPrimary>
                    {m.employee.fullName}
                    {m.employee.vip ? (
                      <span className="ml-1.5 text-[11px] text-signal-text">VIP</span>
                    ) : null}
                    <p className="text-[11.5px] font-normal text-ink-3">
                      {m.employee.employeeCode} · {m.employee.department ?? "—"}
                    </p>
                  </TDPrimary>
                  <TD>{m.employee.zone ?? "—"}</TD>
                  <TD>{m.booking.pickupTime ?? "—"}</TD>
                  <TD>{m.employee.phone ?? "—"}</TD>
                  <TD>
                    <Link
                      href="/bookings"
                      className="text-[12px] text-signal-text hover:underline"
                    >
                      {m.booking.reference}
                    </Link>
                  </TD>
                  <TD align="right">
                    <span className="numeric tracking-[0.14em]">{m.booking.otpCode ?? "—"}</span>
                  </TD>
                  <TD>
                    <StatusChip status={m.booking.status} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
          {!manifest.length ? (
            <div className="p-4">
              <EmptyState
                title="No passengers assigned"
                hint="Move bookings onto this trip from the bookings module."
              />
            </div>
          ) : null}
        </Panel>

        <div className="space-y-4">
          <Panel title="Move a booking onto this trip" eyebrow="Dispatch">
            <ActionForm action={moveBookingAction} submitLabel="Move booking">
              <input type="hidden" name="tripId" value={row.trip.id} />
              <Field
                label="Booking"
                name="bookingId"
                required
                options={unassigned
                  .filter(
                    (u) =>
                      u.booking.tripId !== row.trip.id &&
                      u.booking.bookingDate === row.trip.tripDate,
                  )
                  .map((u) => ({
                    value: String(u.booking.id),
                    label: `${u.booking.reference} · ${u.employee.fullName} (${humanize(
                      u.booking.status,
                    )})`,
                  }))}
              />
            </ActionForm>
            <p className="mt-2 text-[12px] text-ink-3">
              Capacity is enforced: {row.trip.bookedSeats}/{row.trip.capacity} seats used.
            </p>
          </Panel>

          <Panel title="Other trips on this date" eyebrow="Schedule" padded={false}>
            <TableWrap>
              <THead>
                <TH>Reference</TH>
                <TH align="right">Seats</TH>
                <TH>Status</TH>
              </THead>
              <TBody>
                {otherTrips
                  .filter((t) => t.id !== row.trip.id)
                  .map((t) => (
                    <TR key={t.id}>
                      <TDPrimary>
                        <Link
                          href={`/trips/${t.id}`}
                          className="text-signal-text hover:underline"
                        >
                          {t.reference}
                        </Link>
                      </TDPrimary>
                      <TD align="right">
                        {t.bookedSeats}/{t.capacity}
                      </TD>
                      <TD>
                        <StatusChip status={t.status} />
                      </TD>
                    </TR>
                  ))}
              </TBody>
            </TableWrap>
          </Panel>

          <Panel title="Trip incidents" eyebrow="Safety" padded={false}>
            <ul className="divide-y divide-line">
              {tripIncidents.map((i) => (
                <li key={i.id} className="px-4 py-2.5">
                  <p className="text-[13px] font-medium text-ink">
                    {i.type.replace("_", " ")} · {i.severity}
                  </p>
                  <p className="text-[12.5px] text-ink-2">{i.description}</p>
                  <p className="text-[11.5px] text-ink-3">
                    {i.actionTaken ?? "Awaiting action"}
                  </p>
                </li>
              ))}
              {!tripIncidents.length ? (
                <li className="px-4 py-3 text-[12.5px] text-ink-3">
                  No incidents recorded.
                </li>
              ) : null}
            </ul>
          </Panel>

          <Panel title="GPS breadcrumb" eyebrow="Track" padded={false}>
            <ul className="max-h-60 divide-y divide-line overflow-y-auto">
              {track.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between gap-3 px-4 py-1.5"
                >
                  <span className="numeric text-[11.5px]">
                    {g.lat.toFixed(4)}, {g.lng.toFixed(4)}
                  </span>
                  <span className="numeric text-[11.5px] text-ink-3">
                    {Number(g.speedKph ?? 0).toFixed(0)} km/h · {timeOnly(g.recordedAt)} ·{" "}
                    {g.source}
                  </span>
                </li>
              ))}
              {!track.length ? (
                <li className="px-4 py-3 text-[12.5px] text-ink-3">No positions recorded.</li>
              ) : null}
            </ul>
          </Panel>
        </div>
      </div>
      <p className="mt-4 text-[12px] text-ink-3">
        Estimated operating cost for this trip at {money(row.vehicle?.costPerKm ?? 0)}/km:{" "}
        {money(Number(row.vehicle?.costPerKm ?? 0) * Number(row.trip.plannedKm ?? 0))}.
      </p>
    </div>
  );
}
