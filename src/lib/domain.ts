/**
 * Pure business logic for the TMS. No database or framework imports so the
 * rules can be unit tested in isolation (see tests/domain.test.ts).
 *
 * These functions implement the *practical initial* heuristics described in the
 * architecture document: capacity aware nearest-neighbour routing with time
 * windows, plus a VRP-ready interface for a future OR-Tools solver.
 */

export type GeoPoint = { id: number; name: string; lat: number; lng: number };

export type PlanStop = {
  point: GeoPoint;
  sequence: number;
  legKm: number;
  cumulativeKm: number;
  offsetMinutes: number;
};

export type RoutePlan = {
  stops: PlanStop[];
  totalKm: number;
  totalMinutes: number;
};

const EARTH_KM = 6371;

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_KM * Math.asin(Math.sqrt(h)) * 100) / 100;
}

/**
 * Capacity + time window aware routing heuristic.
 *
 * home_to_office  -> start at the pickup farthest from the office, then walk
 *                    towards the office so the last leg is the shortest.
 * office_to_home  -> nearest drop-off first, farthest last.
 *
 * `avgSpeedKph` reflects traffic conditions for the shift window and
 * `minutesPerStop` models dwell time at each pickup/drop-off point.
 */
export function planRoute(
  points: GeoPoint[],
  depot: GeoPoint,
  options: {
    direction: "home_to_office" | "office_to_home" | "inter_office" | "ad_hoc";
    avgSpeedKph?: number;
    minutesPerStop?: number;
  },
): RoutePlan {
  const speed = options.avgSpeedKph && options.avgSpeedKph > 0 ? options.avgSpeedKph : 28;
  const dwell = options.minutesPerStop ?? 3;
  const remaining = [...points];

  const byDistanceFromDepot = (a: GeoPoint, b: GeoPoint) =>
    haversineKm(a, depot) - haversineKm(b, depot);

  const ordered: GeoPoint[] = [];
  if (options.direction === "office_to_home") {
    // depart depot, serve nearest first
    let cursor: GeoPoint = depot;
    while (remaining.length) {
      remaining.sort((a, b) => haversineKm(cursor, a) - haversineKm(cursor, b));
      const next = remaining.shift()!;
      ordered.push(next);
      cursor = next;
    }
  } else {
    // start with the pickup farthest from the office and work inwards
    let cursor: GeoPoint = [...remaining].sort(byDistanceFromDepot)[0] ?? depot;
    while (remaining.length) {
      remaining.sort((a, b) => haversineKm(cursor, a) - haversineKm(cursor, b));
      const next = remaining.shift()!;
      if (next.id !== cursor.id || ordered.length === 0) ordered.push(next);
      cursor = next;
    }
  }

  const stops: PlanStop[] = [];
  let cumulativeKm = 0;
  let minutes = 0;
  let prev: GeoPoint = depot;

  ordered.forEach((point, index) => {
    const legKm = haversineKm(prev, point);
    const travelMin = (legKm / speed) * 60;
    minutes += travelMin + (index === 0 ? 0 : dwell);
    cumulativeKm += legKm;
    stops.push({
      point,
      sequence: index + 1,
      legKm,
      cumulativeKm: Math.round(cumulativeKm * 100) / 100,
      offsetMinutes: Math.round(minutes),
    });
    prev = point;
  });

  const finalLeg = haversineKm(prev, depot);
  const totalKm = Math.round((cumulativeKm + finalLeg) * 100) / 100;
  const totalMinutes = Math.round(minutes + (finalLeg / speed) * 60);

  return { stops, totalKm, totalMinutes };
}

/** Pickup time so that the employee arrives `leadMinutes` before shift start. */
export function departureTimeForShift(
  shiftStart: string,
  routeMinutes: number,
  leadMinutes = 10,
): string {
  const [h, m] = shiftStart.split(":").map(Number);
  const total = h * 60 + m - routeMinutes - leadMinutes;
  const clamped = Math.max(0, total);
  const hh = Math.floor(clamped / 60) % 24;
  const mm = clamped % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export type VehicleLike = {
  id: number;
  capacity: number;
  status: string;
  costPerKm: number;
  vehicleType?: string;
};

/**
 * Recommends the smallest *available* vehicle that satisfies the seat demand,
 * tie-broken on running cost per km so we avoid wasting large buses on small
 * loads (minimising empty vehicle movement).
 */
export function recommendVehicle<T extends VehicleLike>(
  vehicles: T[],
  seatsRequired: number,
): T | null {
  const eligible = vehicles.filter(
    (v) => v.status === "available" && v.capacity >= seatsRequired,
  );
  if (!eligible.length) return null;
  eligible.sort((a, b) => a.capacity - b.capacity || a.costPerKm - b.costPerKm);
  return eligible[0];
}

export type DriverLike = { id: number; status: string; ratingAvg: number | null };

export function recommendDriver<T extends DriverLike>(drivers: T[]): T | null {
  const eligible = drivers.filter((d) => d.status === "available");
  if (!eligible.length) return null;
  eligible.sort((a, b) => (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0));
  return eligible[0];
}

/* ------------------------------------------------------- booking rules */

export type BookingRuleInput = {
  employeeId: number;
  direction: string;
  bookingDate: string;
  seats: number;
  existing: Array<{ employeeId: number; direction: string; bookingDate: string; status: string }>;
  cancellationPolicyHours?: number;
};

export type RuleResult = { ok: true } | { ok: false; reason: string; code: string };

const OPEN_STATUSES = ["pending", "approved", "waitlisted", "assigned", "in_progress"];

/** Prevents duplicate / conflicting bookings for the same employee + day + leg. */
export function validateBooking(input: BookingRuleInput): RuleResult {
  if (input.seats < 1) return { ok: false, reason: "At least one seat is required.", code: "E_SEATS" };
  if (input.seats > 1) {
    return {
      ok: false,
      reason: "Shared staff transport allows one seat per employee.",
      code: "E_SEATS_MAX",
    };
  }
  const clash = input.existing.find(
    (b) =>
      b.employeeId === input.employeeId &&
      b.bookingDate === input.bookingDate &&
      b.direction === input.direction &&
      OPEN_STATUSES.includes(b.status),
  );
  if (clash) {
    return {
      ok: false,
      reason: `An active ${input.direction.replace(/_/g, " ")} booking already exists for ${input.bookingDate}.`,
      code: "E_DUPLICATE",
    };
  }
  return { ok: true };
}

export type TripLike = {
  id: number;
  capacity: number;
  bookedSeats: number;
  status: string;
  tripDate: string;
  direction: string;
};

/** Capacity guard used whenever a booking is attached to a trip. */
export function canAssignToTrip(
  trip: TripLike,
  seats: number,
  tripDate: string,
): RuleResult {
  if (["completed", "cancelled", "breakdown"].includes(trip.status)) {
    return { ok: false, reason: "This trip is closed and cannot take bookings.", code: "E_TRIP_CLOSED" };
  }
  if (trip.tripDate !== tripDate) {
    return { ok: false, reason: "Trip date does not match the booking date.", code: "E_DATE" };
  }
  if (trip.bookedSeats + seats > trip.capacity) {
    return {
      ok: false,
      reason: `Capacity exceeded: ${trip.bookedSeats}/${trip.capacity} seats already allocated.`,
      code: "E_CAPACITY",
    };
  }
  return { ok: true };
}

/** Simplest safe transition table for trip state machine. */
export const TRIP_TRANSITIONS: Record<string, string[]> = {
  scheduled: ["dispatching", "in_progress", "delayed", "cancelled"],
  dispatching: ["in_progress", "delayed", "cancelled", "scheduled"],
  delayed: ["in_progress", "cancelled", "completed"],
  in_progress: ["completed", "breakdown", "cancelled"],
  breakdown: ["in_progress", "cancelled", "completed"],
  completed: [],
  cancelled: [],
};

export function canTransition(from: string, to: string): boolean {
  return TRIP_TRANSITIONS[from]?.includes(to) ?? false;
}

/* ------------------------------------------------------------- billing */

export type PricingModel = "per_trip" | "per_passenger" | "monthly_fixed" | "distance_based";

export function computeCharge(input: {
  pricingModel: PricingModel;
  unitRate: number;
  seats: number;
  distanceKm: number;
  trips: number;
  waitingMinutes?: number;
  overtimeMinutes?: number;
  waitingChargePerHour?: number;
  overtimeChargePerHour?: number;
}): { amount: number; basis: string } {
  const { pricingModel, unitRate } = input;

  // The base charge, per the contracted pricing model.
  let amount = 0;
  let basis = "";
  switch (pricingModel) {
    case "per_trip":
      amount = unitRate * Math.max(1, input.trips);
      basis = "per trip";
      break;
    case "per_passenger":
      amount = unitRate * input.seats;
      basis = "per passenger";
      break;
    case "distance_based":
      amount = unitRate * input.distanceKm;
      basis = "per km";
      break;
    case "monthly_fixed":
      amount = 0;
      basis = "monthly retainer";
      break;
  }

  // Waiting and overtime are surcharges on top of the base charge, billed per
  // hour. They apply to every pricing model except a fixed monthly retainer,
  // which already covers the contracted service volume.
  if (pricingModel !== "monthly_fixed") {
    const waitingHours = Math.max(0, input.waitingMinutes ?? 0) / 60;
    const overtimeHours = Math.max(0, input.overtimeMinutes ?? 0) / 60;
    amount += waitingHours * (input.waitingChargePerHour ?? 0);
    amount += overtimeHours * (input.overtimeChargePerHour ?? 0);
  }

  return { amount: round2(amount), basis };
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Driver pay for a completed trip incl. overtime & allowances. */
export function computeDriverPay(input: {
  basePay: number;
  allowance: number;
  overtimeMinutes: number;
  overtimeRatePerHour: number;
  deduction?: number;
}): { total: number; overtimePay: number } {
  const overtimePay = round2((input.overtimeMinutes / 60) * input.overtimeRatePerHour);
  return {
    overtimePay,
    total: round2(input.basePay + input.allowance + overtimePay - (input.deduction ?? 0)),
  };
}

/** On-time performance threshold (grace window in minutes). */
export function isOnTime(actual: Date | string | null, scheduled: Date | string | null, graceMinutes = 10): boolean {
  if (!actual || !scheduled) return false;
  const a = typeof actual === "string" ? new Date(actual) : actual;
  const s = typeof scheduled === "string" ? new Date(scheduled) : scheduled;
  return a.getTime() - s.getTime() <= graceMinutes * 60000;
}

export function retentionDate(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
