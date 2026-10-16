/**
 * The status vocabulary.
 *
 * Every operational state in the platform maps to exactly one of five signal
 * lights. Status colour is never a large fill and never the only carrier of
 * meaning — it always travels with a dot and a word. See DESIGN.md §2.4.
 */

export type Tone =
  | "live"
  | "ok"
  | "scheduled"
  | "caution"
  | "critical"
  | "idle";

/** Tailwind classes for each signal light. */
export const TONE_CLASS: Record<Tone, string> = {
  live: "text-st-live",
  ok: "text-st-ok",
  scheduled: "text-st-scheduled",
  caution: "text-st-caution",
  critical: "text-st-critical",
  idle: "text-st-idle",
};

export const TONE_DOT: Record<Tone, string> = {
  live: "bg-st-live",
  ok: "bg-st-ok",
  scheduled: "bg-st-scheduled",
  caution: "bg-st-caution",
  critical: "bg-st-critical",
  idle: "bg-st-idle",
};

export const TONE_WASH: Record<Tone, string> = {
  live: "bg-st-live-wash text-st-live",
  ok: "bg-st-ok-wash text-st-ok",
  scheduled: "bg-st-scheduled-wash text-st-scheduled",
  caution: "bg-st-caution-wash text-st-caution",
  critical: "bg-st-critical-wash text-st-critical",
  idle: "bg-st-idle-wash text-st-ink-3",
};

export const TONE_RING: Record<Tone, string> = {
  live: "ring-st-live/30",
  ok: "ring-st-ok/30",
  scheduled: "ring-st-scheduled/30",
  caution: "ring-st-caution/30",
  critical: "ring-st-critical/30",
  idle: "ring-st-idle/30",
};

/** Which lights pulse. Only genuinely live things pulse. */
export const TONE_PULSES: Record<Tone, boolean> = {
  live: true,
  ok: false,
  scheduled: false,
  caution: false,
  critical: true,
  idle: false,
};

const TRIP_TONES: Record<string, Tone> = {
  scheduled: "scheduled",
  dispatching: "live",
  in_progress: "live",
  completed: "ok",
  delayed: "caution",
  breakdown: "critical",
  cancelled: "idle",
};

const BOOKING_TONES: Record<string, Tone> = {
  pending: "caution",
  approved: "scheduled",
  waitlisted: "caution",
  assigned: "live",
  in_progress: "live",
  completed: "ok",
  no_show: "critical",
  cancelled: "idle",
  rejected: "idle",
};

const VEHICLE_TONES: Record<string, Tone> = {
  available: "ok",
  assigned: "live",
  on_trip: "live",
  under_maintenance: "caution",
  out_of_service: "critical",
};

const DRIVER_TONES: Record<string, Tone> = {
  available: "ok",
  on_trip: "live",
  off_duty: "idle",
  unavailable: "critical",
};

const INCIDENT_TONES: Record<string, Tone> = {
  open: "critical",
  acknowledged: "caution",
  resolved: "ok",
};

const INVOICE_TONES: Record<string, Tone> = {
  draft: "idle",
  issued: "scheduled",
  paid: "ok",
  partial: "caution",
  overdue: "critical",
  void: "idle",
};

const PAYMENT_TONES: Record<string, Tone> = {
  pending: "caution",
  successful: "ok",
  failed: "critical",
};

const COMPANY_TONES: Record<string, Tone> = {
  active: "ok",
  suspended: "critical",
  inactive: "idle",
};

const EARNINGS_TONES: Record<string, Tone> = {
  accrued: "idle",
  approved: "scheduled",
  paid: "ok",
};

const GENERIC_TONES: Record<string, Tone> = {
  new: "caution",
  addressed: "ok",
  planned: "scheduled",
  off_duty: "idle",
  unavailable: "critical",
  no_show: "critical",
  completed: "ok",
  cancelled: "idle",
};

const TABLES: Array<[Record<string, Tone>, string[]]> = [
  [TRIP_TONES, ["scheduled", "dispatching", "in_progress", "completed", "delayed", "breakdown", "cancelled"]],
  [BOOKING_TONES, ["pending", "approved", "waitlisted", "assigned", "in_progress", "completed", "no_show", "cancelled", "rejected"]],
  [VEHICLE_TONES, ["available", "assigned", "on_trip", "under_maintenance", "out_of_service"]],
  [DRIVER_TONES, ["available", "on_trip", "off_duty", "unavailable"]],
  [INCIDENT_TONES, ["open", "acknowledged", "resolved"]],
  [INVOICE_TONES, ["draft", "issued", "paid", "partial", "overdue", "void"]],
  [PAYMENT_TONES, ["pending", "successful", "failed"]],
  [COMPANY_TONES, ["active", "suspended", "inactive"]],
  [EARNINGS_TONES, ["accrued", "approved", "paid"]],
  [GENERIC_TONES, ["new", "addressed", "planned"]],
];

const LOOKUP = new Map<string, Tone>();
for (const [map, keys] of TABLES) {
  for (const key of keys) {
    if (!LOOKUP.has(key)) LOOKUP.set(key, map[key]);
  }
}

/** Map a raw status string to its signal light. Unknown states read as idle. */
export function toneFor(status: string | null | undefined): Tone {
  if (!status) return "idle";
  return LOOKUP.get(status) ?? "idle";
}

/** Human-readable label for a status string. */
export function statusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
