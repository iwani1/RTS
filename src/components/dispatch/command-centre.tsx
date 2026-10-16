"use client";

/**
 * The Dispatch Command Centre.
 *
 * Three panes, one decision surface:
 *   left    the trip board — every duty, its clock, its load
 *   centre  the live map and the event tape
 *   right   the inspector — one trip, fully actionable
 *
 * The inspector is a drawer, not a modal. A dispatcher must never lose the
 * board to look at a duty.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CircleDot,
  Gauge,
  MapPin,
  Navigation,
  Phone,
  Radio,
  Route as RouteIcon,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { statusLabel, toneFor } from "@/lib/status";
import { LiveMap, type MapPoint } from "@/components/live-map";
import { StatusDot, StatusChip } from "@/components/ui/badge";
import { ActionForm, InlineActionForm } from "@/components/action-form";
import { Field } from "@/components/ui/input";
import {
  assignResourcesAction,
  createIncidentAction,
  updateTripStatusAction,
} from "@/app/actions/ops";

export type DispatchPassenger = {
  bookingId: number;
  reference: string;
  name: string;
  status: string;
  pickup: string | null;
};

export type DispatchTrip = {
  id: number;
  reference: string;
  company: string;
  direction: string;
  status: string;
  etd: string;
  eta: string;
  /** Signed minutes from the scheduled departure; null when the trip has not left. */
  deviation: number | null;
  vehicle: string | null;
  vehicleCapacity: number | null;
  driver: string | null;
  driverPhone: string | null;
  bookedSeats: number;
  capacity: number;
  currentOccupancy: number;
  lat: number | null;
  lng: number | null;
  speedKph: number | null;
  heading: number | null;
  waitingMinutes: number;
  overtimeMinutes: number;
  route: string | null;
  passengers: DispatchPassenger[];
};

export type DispatchAlert = {
  id: number;
  type: string;
  severity: string;
  status: string;
  description: string;
  company: string | null;
  vehicle: string | null;
  reportedAt: string;
};

export type DispatchEvent = {
  at: string;
  trip: string | null;
  text: string;
  tone: "live" | "ok" | "caution" | "critical" | "idle";
};

export type DispatchOption = { id: number; label: string; hint?: string };

export function CommandCentre({
  trips,
  alerts,
  events,
  vehicles,
  drivers,
}: {
  trips: DispatchTrip[];
  alerts: DispatchAlert[];
  events: DispatchEvent[];
  vehicles: DispatchOption[];
  drivers: DispatchOption[];
}) {
  const [selectedId, setSelectedId] = useState<number | null>(trips[0]?.id ?? null);
  const selected = trips.find((t) => t.id === selectedId) ?? null;

  const points = useMemo<MapPoint[]>(
    () =>
      trips
        .filter((t) => t.lat != null && t.lng != null)
        .map((t) => ({
          id: `t${t.id}`,
          lat: t.lat as number,
          lng: t.lng as number,
          label: t.vehicle ?? t.reference,
          kind: "vehicle" as const,
          tone:
            t.status === "breakdown"
              ? ("rose" as const)
              : t.status === "delayed"
                ? ("amber" as const)
                : t.status === "in_progress"
                  ? ("teal" as const)
                  : ("navy" as const),
          eta: t.eta,
        })),
    [trips],
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_380px]">
      {/* ---------------------------------------------------------- board */}
      <section className="surface flex max-h-[calc(100vh-11rem)] flex-col overflow-hidden xl:rounded-[8px]">
        <header className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
          <h2 className="eyebrow">Trip board</h2>
          <span className="numeric text-[11px] text-ink-3">{trips.length} duties</span>
        </header>
        <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
          {trips.map((trip) => {
            const active = trip.id === selectedId;
            const tone = toneFor(trip.status);
            const load = trip.capacity > 0 ? trip.bookedSeats / trip.capacity : 0;
            return (
              <li key={trip.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(trip.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "relative w-full px-3.5 py-2.5 text-left transition-colors duration-150",
                    active ? "bg-signal-wash" : "hover:bg-surface-2",
                  )}
                >
                  {active ? (
                    <span className="absolute inset-y-0 left-0 w-[2px] bg-signal" />
                  ) : null}
                  <div className="flex items-center justify-between gap-2">
                    <span className="numeric truncate text-[12.5px] font-medium text-ink">
                      {trip.reference}
                    </span>
                    <StatusDot tone={tone} />
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="truncate text-[11.5px] text-ink-3">{trip.company}</span>
                    <span className="numeric shrink-0 text-[11.5px] text-ink-2">{trip.etd}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="h-1 w-full overflow-hidden rounded-full bg-surface-3">
                      <span
                        className={cn(
                          "block h-full rounded-full",
                          load > 1 ? "bg-st-critical" : load > 0.85 ? "bg-st-caution" : "bg-signal",
                        )}
                        style={{ width: `${Math.min(100, load * 100)}%` }}
                      />
                    </span>
                    <span className="numeric shrink-0 text-[10.5px] text-ink-3">
                      {trip.bookedSeats}/{trip.capacity || "—"}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
          {!trips.length ? (
            <li className="px-3.5 py-8 text-center text-[12.5px] text-ink-3">
              No duties on the board.
            </li>
          ) : null}
        </ul>
      </section>

      {/* ---------------------------------------------------------- centre */}
      <section className="flex min-w-0 flex-col gap-4">
        <div className="surface overflow-hidden rounded-[8px]">
          {points.length ? (
            <LiveMap initial={points} pollUrl="/api/dispatch/live" />
          ) : (
            <div className="flex h-[320px] flex-col items-center justify-center gap-2 px-6 text-center">
              <Radio className="h-5 w-5 text-ink-3" />
              <p className="font-display text-[13px] text-ink-2">No positions reporting</p>
              <p className="max-w-sm text-[12px] text-ink-3">
                Drivers share a location when they start a trip from the driver app. Until a
                telematics provider is configured, positions arrive from the driver device.
              </p>
            </div>
          )}
        </div>

        {/* the event tape */}
        <div className="surface overflow-hidden rounded-[8px]">
          <header className="flex items-center justify-between border-b border-line px-3.5 py-2">
            <h2 className="eyebrow">Event tape</h2>
            <span className="numeric text-[11px] text-ink-3">newest first</span>
          </header>
          <ul className="max-h-[220px] divide-y divide-line overflow-y-auto">
            {events.map((event, index) => (
              <li
                key={`${event.at}-${index}`}
                className="flex items-center gap-2.5 px-3.5 py-1.5"
              >
                <span className="numeric shrink-0 text-[11px] text-ink-3">{event.at}</span>
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    event.tone === "critical"
                      ? "bg-st-critical"
                      : event.tone === "caution"
                        ? "bg-st-caution"
                        : event.tone === "live"
                          ? "bg-st-live"
                          : event.tone === "ok"
                            ? "bg-st-ok"
                            : "bg-st-idle",
                  )}
                />
                {event.trip ? (
                  <span className="numeric shrink-0 text-[11px] text-ink-2">{event.trip}</span>
                ) : null}
                <span className="truncate text-[12px] text-ink-2">{event.text}</span>
              </li>
            ))}
            {!events.length ? (
              <li className="px-3.5 py-6 text-center text-[12.5px] text-ink-3">
                Nothing has happened yet today.
              </li>
            ) : null}
          </ul>
        </div>

        {/* alerts */}
        <div className="surface overflow-hidden rounded-[8px]">
          <header className="flex items-center justify-between border-b border-line px-3.5 py-2">
            <h2 className="eyebrow">Operational alerts</h2>
            <Link
              href="/incidents"
              className="inline-flex items-center gap-1 text-[11.5px] text-ink-3 transition-colors hover:text-ink"
            >
              All incidents
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </header>
          <ul className="max-h-[200px] divide-y divide-line overflow-y-auto">
            {alerts.map((alert) => (
              <li key={alert.id} className="flex items-start gap-2.5 px-3.5 py-2.5">
                <AlertTriangle
                  className={cn(
                    "mt-0.5 h-3.5 w-3.5 shrink-0",
                    alert.severity === "critical"
                      ? "text-st-critical"
                      : alert.severity === "high"
                        ? "text-st-caution"
                        : "text-ink-3",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium text-ink">
                    {statusLabel(alert.type)}
                  </p>
                  <p className="truncate text-[11.5px] text-ink-3">{alert.description}</p>
                </div>
                <StatusChip status={alert.status} />
              </li>
            ))}
            {!alerts.length ? (
              <li className="px-3.5 py-6 text-center text-[12.5px] text-ink-3">
                No open incidents. The operation is clean.
              </li>
            ) : null}
          </ul>
        </div>
      </section>

      {/* -------------------------------------------------------- inspector */}
      <aside className="surface flex max-h-[calc(100vh-11rem)] flex-col overflow-hidden xl:rounded-[8px]">
        {selected ? (
          <>
            <header className="border-b border-line px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="numeric text-[13px] font-medium text-ink">{selected.reference}</p>
                <StatusChip status={selected.status} />
              </div>
              <p className="mt-0.5 text-[12px] text-ink-3">
                {selected.company} · {statusLabel(selected.direction)}
              </p>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {/* clock */}
              <div className="grid grid-cols-3 gap-2">
                <Clock label="ETD" value={selected.etd} />
                <Clock label="ETA" value={selected.eta} />
                <Clock
                  label="Deviation"
                  value={
                    selected.deviation == null
                      ? "—"
                      : `${selected.deviation > 0 ? "+" : ""}${selected.deviation}m`
                  }
                  tone={
                    selected.deviation == null
                      ? undefined
                      : selected.deviation > 5
                        ? "critical"
                        : selected.deviation > 0
                          ? "caution"
                          : "ok"
                  }
                />
              </div>

              {/* facts */}
              <dl className="mt-3 divide-y divide-line border-y border-line">
                <Fact icon={Navigation} label="Vehicle" value={selected.vehicle ?? "Unassigned"} />
                <Fact icon={RouteIcon} label="Route" value={selected.route ?? "Direct"} />
                <Fact
                  icon={Users}
                  label="Load"
                  value={`${selected.bookedSeats} booked · ${selected.currentOccupancy} aboard · ${selected.capacity || "—"} seats`}
                />
                {selected.driver ? (
                  <Fact
                    icon={Phone}
                    label="Driver"
                    value={`${selected.driver}${selected.driverPhone ? ` · ${selected.driverPhone}` : ""}`}
                  />
                ) : (
                  <Fact icon={Phone} label="Driver" value="Unassigned" tone="caution" />
                )}
                {selected.speedKph != null ? (
                  <Fact
                    icon={Gauge}
                    label="Speed"
                    value={`${Math.round(selected.speedKph)} km/h`}
                  />
                ) : null}
                {selected.waitingMinutes > 0 || selected.overtimeMinutes > 0 ? (
                  <Fact
                    icon={CircleDot}
                    label="Chargeable"
                    value={`${selected.waitingMinutes}m waiting · ${selected.overtimeMinutes}m overtime`}
                    tone="caution"
                  />
                ) : null}
              </dl>

              {/* manifest */}
              <div className="mt-3">
                <p className="eyebrow mb-1.5">Manifest</p>
                <ul className="divide-y divide-line rounded-[8px] border border-line">
                  {selected.passengers.map((p) => (
                    <li key={p.bookingId} className="flex items-center gap-2 px-2.5 py-1.5">
                      <StatusDot tone={toneFor(p.status)} />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                        {p.name}
                      </span>
                      <span className="numeric shrink-0 text-[10.5px] text-ink-3">
                        {p.reference}
                      </span>
                    </li>
                  ))}
                  {!selected.passengers.length ? (
                    <li className="px-2.5 py-3 text-center text-[12px] text-ink-3">
                      No passengers booked on this duty.
                    </li>
                  ) : null}
                </ul>
              </div>

              {/* actions */}
              <div className="mt-3">
                <p className="eyebrow mb-1.5">Move the duty</p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.status !== "in_progress" ? (
                    <InlineActionForm
                      action={updateTripStatusAction}
                      hiddenFields={{ tripId: selected.id, status: "in_progress" }}
                      submitLabel="Depart"
                      variant="primary"
                    />
                  ) : null}
                  {selected.status !== "delayed" ? (
                    <InlineActionForm
                      action={updateTripStatusAction}
                      hiddenFields={{ tripId: selected.id, status: "delayed" }}
                      submitLabel="Flag delay"
                    />
                  ) : null}
                  {selected.status !== "breakdown" ? (
                    <InlineActionForm
                      action={updateTripStatusAction}
                      hiddenFields={{ tripId: selected.id, status: "breakdown" }}
                      submitLabel="Breakdown"
                      variant="danger"
                    />
                  ) : null}
                  {selected.status !== "completed" ? (
                    <InlineActionForm
                      action={updateTripStatusAction}
                      hiddenFields={{ tripId: selected.id, status: "completed" }}
                      submitLabel="Complete"
                    />
                  ) : null}
                </div>
              </div>

              {/* assign */}
              <div className="mt-4">
                <p className="eyebrow mb-1.5">Reassign</p>
                <ActionForm
                  action={assignResourcesAction}
                  submitLabel="Apply assignment"
                  resetOnSuccess
                  submitVariant="secondary"
                >
                  <input type="hidden" name="tripId" value={selected.id} />
                  <div className="flex flex-col gap-2">
                    <Field
                      label="Vehicle"
                      name="vehicleId"
                      options={[
                        { value: "", label: "Keep current" },
                        ...vehicles.map((v) => ({ value: String(v.id), label: v.label })),
                      ]}
                    />
                    <Field
                      label="Driver"
                      name="driverId"
                      options={[
                        { value: "", label: "Keep current" },
                        ...drivers.map((d) => ({ value: String(d.id), label: d.label })),
                      ]}
                    />
                  </div>
                </ActionForm>
              </div>

              {/* raise */}
              <div className="mt-4 border-t border-line pt-3">
                <p className="eyebrow mb-1.5">Raise an event</p>
                <ActionForm
                  action={createIncidentAction}
                  submitLabel="Report"
                  resetOnSuccess
                  submitVariant="secondary"
                >
                  <input type="hidden" name="tripId" value={selected.id} />
                  <div className="flex flex-col gap-2">
                    <Field
                      label="Type"
                      name="type"
                      options={[
                        { value: "breakdown", label: "Breakdown" },
                        { value: "accident", label: "Accident" },
                        { value: "sos", label: "SOS" },
                        { value: "missed_pickup", label: "Missed pickup" },
                        { value: "delay", label: "Delay" },
                        { value: "safety", label: "Safety" },
                      ]}
                    />
                    <Field
                      label="Severity"
                      name="severity"
                      options={[
                        { value: "low", label: "Low" },
                        { value: "medium", label: "Medium" },
                        { value: "high", label: "High" },
                        { value: "critical", label: "Critical" },
                      ]}
                    />
                    <Field label="Description" name="description" type="textarea" required />
                  </div>
                </ActionForm>
              </div>
            </div>

            <footer className="border-t border-line px-4 py-2.5">
              <Link
                href={`/trips/${selected.id}`}
                className="inline-flex items-center gap-1.5 text-[12px] text-ink-2 transition-colors hover:text-ink"
              >
                <MapPin className="h-3.5 w-3.5" />
                Open the full trip record
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </footer>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <Radio className="h-5 w-5 text-ink-3" />
            <p className="font-display text-[13px] text-ink-2">Nothing selected</p>
            <p className="text-[12px] text-ink-3">
              Choose a duty from the board to see its manifest and act on it.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Clock({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "caution" | "critical";
}) {
  const color =
    tone === "critical"
      ? "text-st-critical"
      : tone === "caution"
        ? "text-st-caution"
        : tone === "ok"
          ? "text-st-ok"
          : "text-ink";
  return (
    <div className="rounded-[8px] border border-line bg-surface-2 px-2.5 py-2">
      <p className="eyebrow">{label}</p>
      <p className={cn("numeric mt-0.5 text-[15px] font-medium", color)}>{value}</p>
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Navigation;
  label: string;
  value: string;
  tone?: "caution";
}) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-3" />
      <dt className="w-[72px] shrink-0 text-[12px] text-ink-3">{label}</dt>
      <dd
        className={cn(
          "min-w-0 flex-1 text-[12.5px]",
          tone === "caution" ? "text-st-caution" : "text-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
