import Link from "next/link";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { driverEarnings, drivers, routes, trips, vehicles } from "@/db/schema";
import { ActionForm, InlineActionForm } from "@/components/action-form";
import {
  Button,
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
import { setAvailabilityAction, driverTripAction } from "@/app/actions/ops";
import { requireSection } from "@/lib/auth";
import { dateOnly, humanize, money, n, timeOnly, todayISO } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DriverAppPage() {
  const user = await requireSection("driverapp");
  const [driver] = await db.select().from(drivers).where(eq(drivers.userId, user.id)).limit(1);

  if (!driver) {
    return (
      <div>
        <PageHeader eyebrow="Driver" title="Driver app" />
        <Panel title="No driver record linked">
          <p className="text-[13px] text-ink-2">
            Your login is not linked to a driver record. Contact the fleet manager to
            complete your onboarding.
          </p>
        </Panel>
      </div>
    );
  }

  const today = todayISO();
  const duties = await db
    .select({
      trip: trips,
      vehicle: vehicles,
      route: routes.name,
      company: sql<string>`(select name from companies c where c.id = ${trips.companyId})`,
    })
    .from(trips)
    .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
    .leftJoin(routes, eq(routes.id, trips.routeId))
    .where(and(eq(trips.driverId, driver.id), gte(trips.tripDate, today)))
    .orderBy(trips.scheduledDeparture)
    .limit(20);

  const recent = await db
    .select({ trip: trips, vehicle: vehicles })
    .from(trips)
    .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
    .where(
      and(
        eq(trips.driverId, driver.id),
        inArray(trips.status, ["completed", "cancelled"]),
      ),
    )
    .orderBy(desc(trips.tripDate))
    .limit(10);

  const [earnings] = await db
    .select({
      trips: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(${driverEarnings.total}), 0)`,
      overtime: sql<string>`coalesce(sum(${driverEarnings.overtimePay}), 0)`,
      unpaid: sql<string>`coalesce(sum(case when ${driverEarnings.status} <> 'paid' then ${driverEarnings.total} else 0 end), 0)`,
    })
    .from(driverEarnings)
    .where(eq(driverEarnings.driverId, driver.id));

  const nextDuty = duties.find((d) => ["scheduled", "dispatching"].includes(d.trip.status));
  const onDuty = duties.find((d) =>
    ["in_progress", "delayed", "breakdown"].includes(d.trip.status),
  );
  const remaining = duties.filter((d) =>
    ["scheduled", "dispatching"].includes(d.trip.status),
  ).length;

  return (
    <div>
      <PageHeader
        eyebrow="Driver"
        title="Driver app"
        subtitle={`${driver.fullName} · licence ${driver.licenseNo} (exp ${dateOnly(
          driver.licenseExpiry,
        )})`}
      />

      <MetricStrip>
        <MetricCell label="Duties remaining today" value={n(remaining)} />
        <MetricCell
          label="On duty now"
          value={onDuty ? "Yes" : "No"}
          tone={onDuty ? "live" : "idle"}
        />
        <MetricCell
          label="Earnings accrued"
          value={money(earnings?.unpaid)}
          hint={`${n(Number(earnings?.trips ?? 0))} trips · ${money(earnings?.overtime)} overtime`}
        />
        <MetricCell
          label="Availability"
          value={humanize(driver.status)}
          tone={driver.status === "available" ? "ok" : "caution"}
        />
      </MetricStrip>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Current duty" eyebrow="Now" className="lg:col-span-2">
          {onDuty ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-[19px] font-semibold text-ink">
                    {onDuty.trip.reference}
                  </p>
                  <p className="text-[13px] text-ink-2">
                    {humanize(onDuty.trip.direction)} · {onDuty.company} ·{" "}
                    {onDuty.route ?? "corridor"}
                  </p>
                  <p className="mt-1 text-[13px] text-ink-2">
                    {onDuty.vehicle
                      ? `${onDuty.vehicle.registrationNo} · ${onDuty.vehicle.make} ${onDuty.vehicle.model}`
                      : "No vehicle assigned"}
                  </p>
                </div>
                <StatusChip status={onDuty.trip.status} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <InlineActionForm
                  action={driverTripAction}
                  hiddenFields={{ tripId: onDuty.trip.id, op: "complete" }}
                  submitLabel="Complete journey"
                  variant="primary"
                />
                <InlineActionForm
                  action={driverTripAction}
                  hiddenFields={{ tripId: onDuty.trip.id, op: "delay" }}
                  submitLabel="Report delay"
                  variant="secondary"
                />
                <ButtonLink href={`/driver/trip/${onDuty.trip.id}`} variant="outline">
                  Open manifest &amp; boarding
                </ButtonLink>
              </div>
              {onDuty.vehicle ? (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                    onDuty.vehicle.registrationNo,
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-[12px] font-medium text-signal-text underline"
                >
                  Open navigation for the assigned corridor
                </a>
              ) : null}
            </>
          ) : nextDuty ? (
            <>
              <p className="eyebrow">Next duty</p>
              <p className="mt-1 font-display text-[19px] font-semibold text-ink">
                {nextDuty.trip.reference} · {timeOnly(nextDuty.trip.scheduledDeparture)}
              </p>
              <p className="text-[13px] text-ink-2">
                {nextDuty.company} · {nextDuty.vehicle?.registrationNo ?? "vehicle to be assigned"} ·{" "}
                {nextDuty.trip.bookedSeats} passengers
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <ButtonLink href={`/driver/trip/${nextDuty.trip.id}`} variant="signal">
                  View trip sheet
                </ButtonLink>
                <InlineActionForm
                  action={driverTripAction}
                  hiddenFields={{ tripId: nextDuty.trip.id, op: "start" }}
                  submitLabel="Start journey"
                  variant="primary"
                />
              </div>
            </>
          ) : (
            <EmptyState
              title="No duties assigned"
              hint="New assignments appear here and in your notifications."
            />
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="My availability" eyebrow="Status">
            <ActionForm action={setAvailabilityAction} submitLabel="Update availability">
              <Field
                label="Duty status"
                name="status"
                options={[
                  { value: "available", label: "Available for assignment" },
                  { value: "off_duty", label: "Off duty" },
                  { value: "unavailable", label: "Unavailable (leave / sick)" },
                ]}
              />
            </ActionForm>
            <div className="mt-3">
              <Notice tone="caution">
                Changing to unavailable immediately blocks new trip assignments for you.
              </Notice>
            </div>
          </Panel>

          <Panel title="Earnings summary" eyebrow="Payroll">
            <DefinitionList
              items={[
                { label: "Trip earnings (all time)", value: money(earnings?.total) },
                { label: "Overtime", value: money(earnings?.overtime) },
                { label: "Pending payroll", value: money(earnings?.unpaid) },
                { label: "Trip allowance per trip", value: money(driver.tripAllowance) },
              ]}
            />
            <p className="mt-2 text-[12px] text-ink-3">
              Overtime is paid at GHS 30.00 per hour beyond the planned arrival.
            </p>
          </Panel>
        </div>
      </div>

      <Panel className="mt-4" title="My schedule" eyebrow="Duties" padded={false}>
        <TableWrap>
          <THead>
            <TH>Trip</TH>
            <TH>Date</TH>
            <TH align="right">Departure</TH>
            <TH>Vehicle</TH>
            <TH align="right">Passengers</TH>
            <TH>Status</TH>
            <TH align="right">Sheet</TH>
          </THead>
          <TBody>
            {duties.map((d) => (
              <TR key={d.trip.id}>
                <TDPrimary>{d.trip.reference}</TDPrimary>
                <TD>{dateOnly(d.trip.tripDate)}</TD>
                <TD align="right">{timeOnly(d.trip.scheduledDeparture)}</TD>
                <TD>{d.vehicle?.registrationNo ?? "—"}</TD>
                <TD align="right">
                  {d.trip.bookedSeats}/{d.trip.capacity}
                </TD>
                <TD>
                  <StatusChip status={d.trip.status} />
                </TD>
                <TD align="right">
                  <Link
                    href={`/driver/trip/${d.trip.id}`}
                    className="text-[12px] font-medium text-signal-text hover:underline"
                  >
                    Open
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </TableWrap>
        {!duties.length ? (
          <div className="p-4">
            <EmptyState title="No scheduled duties" />
          </div>
        ) : null}
      </Panel>

      <Panel className="mt-4" title="Recently completed" eyebrow="History" padded={false}>
        <TableWrap>
          <THead>
            <TH>Trip</TH>
            <TH>Date</TH>
            <TH align="right">Departure</TH>
            <TH align="right">Arrival</TH>
            <TH align="right">Passengers</TH>
            <TH>Status</TH>
          </THead>
          <TBody>
            {recent.map((r) => (
              <TR key={r.trip.id}>
                <TDPrimary>{r.trip.reference}</TDPrimary>
                <TD>{dateOnly(r.trip.tripDate)}</TD>
                <TD align="right">{timeOnly(r.trip.actualDeparture)}</TD>
                <TD align="right">{timeOnly(r.trip.actualArrival)}</TD>
                <TD align="right">{n(r.trip.bookedSeats)}</TD>
                <TD>
                  <StatusChip status={r.trip.status} />
                </TD>
              </TR>
            ))}
          </TBody>
        </TableWrap>
        {!recent.length ? (
          <div className="p-4">
            <EmptyState title="No completed trips yet" />
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
