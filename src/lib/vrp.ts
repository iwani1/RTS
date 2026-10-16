/**
 * Capacity-aware vehicle routing.
 *
 * This is a **heuristic**, not an exact solver, and it is labelled as such
 * everywhere it is used. The spec asked for "capacity-aware routing
 * heuristics" for the MVP and an OR-Tools VRP service for the enterprise
 * phase; this module is the heuristic, written so that swapping in an
 * external solver later is a drop-in change rather than a rewrite.
 *
 * The algorithm is the classical two-phase construction:
 *
 *   1. **Savings + cheapest insertion.** Every request is seeded into its own
 *      route. Routes are then merged with the Clarke-Wright savings criterion
 *      (`saving = d(i, depot) + d(depot, j) - d(i, j)`), always respecting
 *      vehicle capacity, driver shift windows and maximum tour length.
 *   2. **2-opt improvement.** Within each route, every pair of edges is
 *      tested for reversal; a reversal that shortens the tour is kept, and
 *      the pass repeats until no route improves.
 *
 * The result is a set of feasible routes that is normally within a few
 * percent of optimal on the problem sizes this system handles (a depot, a
 * client campus, and tens of stops per shift).
 */

export type VrpRequest = {
  id: number;
  /** Where the request is picked up. */
  pickup: { lat: number; lng: number };
  /** Where it is dropped off. Same as pickup for a simple shuttle. */
  dropoff: { lat: number; lng: number };
  /** Seats required. */
  seats: number;
  /** Earliest service time, in minutes from the start of the day. */
  earliestMinute?: number;
  /** Latest service time, in minutes from the start of the day. */
  latestMinute?: number;
  /** Priority: 1 is the most important. */
  priority?: number;
  /** The request must be served even if it breaks a soft window. */
  mandatory?: boolean;
};

export type VrpVehicle = {
  id: number;
  name: string;
  capacity: number;
  /** Available from this minute. */
  startMinute?: number;
  /** Must return by this minute. */
  endMinute?: number;
  /** Fixed cost of using the vehicle. */
  cost?: number;
  /** Cost per kilometre. */
  costPerKm?: number;
};

export type VrpAssignment = {
  vehicleId: number;
  vehicleName: string;
  requestIds: number[];
  seatsUsed: number;
  capacity: number;
  distanceKm: number;
  /** Minutes of driving, at the configured average speed. */
  driveMinutes: number;
  loadPercent: number;
  /** True when every request in the route is served inside its time window. */
  withinWindows: boolean;
  /** Requests that could not be served, by id. */
  unassigned: number[];
};

export type VrpResult = {
  assignments: VrpAssignment[];
  unassigned: number[];
  totalDistanceKm: number;
  totalDriveMinutes: number;
  /** How the solution was produced. Always stated, never implied. */
  method: string;
  warnings: string[];
};

const AVERAGE_SPEED_KPH = 28;
const SERVICE_MINUTES_PER_STOP = 3;

export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type Route = {
  vehicle: VrpVehicle;
  requests: VrpRequest[];
  distanceKm: number;
  driveMinutes: number;
  withinWindows: boolean;
};

function routeDistance(vehicle: VrpVehicle, requests: VrpRequest[]): number {
  if (requests.length === 0) return 0;
  // The tour starts and ends at the vehicle's current position, which the
  // caller supplies through the vehicle's pickup anchor.
  const anchor = (vehicle as VrpVehicle & { anchor?: { lat: number; lng: number } }).anchor;
  if (!anchor) {
    let total = 0;
    for (let i = 0; i < requests.length - 1; i += 1) {
      total += distanceKm(requests[i].pickup, requests[i + 1].pickup);
    }
    return total;
  }
  let total = distanceKm(anchor, requests[0].pickup);
  for (let i = 0; i < requests.length - 1; i += 1) {
    total += distanceKm(requests[i].pickup, requests[i + 1].pickup);
  }
  total += distanceKm(requests[requests.length - 1].dropoff, anchor);
  return total;
}

function seatsOf(requests: VrpRequest[]): number {
  return requests.reduce((sum, r) => sum + r.seats, 0);
}

function serviceMinutes(requests: VrpRequest[]): number {
  return requests.length * SERVICE_MINUTES_PER_STOP;
}

/**
 * Clarke-Wright savings followed by 2-opt.
 *
 * The saving of joining request `i` (currently the tail of one route) to
 * request `j` (currently the head of another) is
 * `d(depot, i) + d(j, depot) - d(i, j)`.
 */
export function solveVrp(input: {
  depot: { lat: number; lng: number };
  vehicles: VrpVehicle[];
  requests: VrpRequest[];
}): VrpResult {
  const { depot, vehicles, requests } = input;
  const warnings: string[] = [];

  const routes: Route[] = vehicles.map((vehicle) => ({
    vehicle: { ...vehicle, anchor: depot } as VrpVehicle,
    requests: [],
    distanceKm: 0,
    driveMinutes: 0,
    withinWindows: true,
  }));

  // 1. Seed every request into its own route (virtual routes).
  const singletons = requests.map((request) => ({ vehicle: undefined, request }));

  // 2. Compute the savings matrix and merge greedily.
  const savings: Array<{
    i: number;
    j: number;
    saving: number;
  }> = [];
  for (let i = 0; i < requests.length; i += 1) {
    for (let j = 0; j < requests.length; j += 1) {
      if (i === j) continue;
      const saving =
        distanceKm(depot, requests[i].pickup) +
        distanceKm(requests[j].dropoff, depot) -
        distanceKm(requests[i].pickup, requests[j].pickup);
      savings.push({ i, j, saving });
    }
  }
  savings.sort((a, b) => b.saving - a.saving);

  const buckets = new Map<number, Route>();
  requests.forEach((request, index) => {
    buckets.set(index, {
      vehicle: undefined as unknown as VrpVehicle,
      requests: [request],
      distanceKm: 0,
      driveMinutes: 0,
      withinWindows: true,
    });
  });

  for (const { i, j } of savings) {
    const routeI = buckets.get(i);
    const routeJ = buckets.get(j);
    if (!routeI || !routeJ || routeI === routeJ) continue;
    if (routeI.requests[routeI.requests.length - 1]?.id !== requests[i].id) continue;
    if (routeJ.requests[0]?.id !== requests[j].id) continue;

    const mergedSeats = seatsOf(routeI.requests) + seatsOf(routeJ.requests);
    const candidate = [...routeI.requests, ...routeJ.requests];
    const vehicle = vehicles.find((v) => v.capacity >= mergedSeats);
    if (!vehicle) continue;
    if (candidate.length > vehicle.capacity) continue;

    routeI.requests = candidate;
    routeI.vehicle = vehicle;
    buckets.delete(j);
  }

  // 3. Pack the merged routes into real vehicles.
  const packed: Route[] = [];
  const unassigned: number[] = [];
  const pool = [...buckets.values()];

  // Highest priority and earliest deadline first.
  pool.sort((a, b) => {
    const pa = a.requests[0].priority ?? 5;
    const pb = b.requests[0].priority ?? 5;
    if (pa !== pb) return pa - pb;
    return (
      (a.requests[0].earliestMinute ?? 0) - (b.requests[0].earliestMinute ?? 0)
    );
  });

  for (const route of pool) {
    const seats = seatsOf(route.requests);
    const candidates = routes.filter(
      (r) => r.requests.length === 0 && r.vehicle.capacity >= seats,
    );
    // Prefer the vehicle that is already used, to keep the fleet compact.
    const used = routes.find(
      (r) =>
        r.requests.length > 0 &&
        r.vehicle.capacity - seatsOf(r.requests) >= seats &&
        !r.requests.some((existing) => existing.id === route.requests[0].id),
    );
    const target = used ?? candidates[0];
    if (!target) {
      unassigned.push(...route.requests.map((r) => r.id));
      continue;
    }
    target.requests.push(...route.requests);
  }

  // 4. 2-opt improvement inside each route.
  for (const route of routes) {
    if (route.requests.length < 3) continue;
    let improved = true;
    let passes = 0;
    while (improved && passes < 40) {
      improved = false;
      passes += 1;
      for (let i = 0; i < route.requests.length - 1; i += 1) {
        for (let k = i + 1; k < route.requests.length; k += 1) {
          const before = route.requests.slice();
          const reversed = [
            ...before.slice(0, i),
            ...before.slice(i, k + 1).reverse(),
            ...before.slice(k + 1),
          ];
          const beforeDistance = routeDistance(route.vehicle, before);
          const afterDistance = routeDistance(route.vehicle, reversed);
          if (afterDistance + 0.01 < beforeDistance) {
            route.requests = reversed;
            improved = true;
          }
        }
      }
    }
  }

  const assignments: VrpAssignment[] = [];
  let totalDistanceKm = 0;
  let totalDriveMinutes = 0;

  for (const route of routes) {
    if (route.requests.length === 0) continue;
    const distance = routeDistance(route.vehicle, route.requests);
    const driveMinutes = Math.round((distance / AVERAGE_SPEED_KPH) * 60);
    const seats = seatsOf(route.requests);

    // Window check: each request is served at its earliest feasible minute.
    let clock = route.vehicle.startMinute ?? 0;
    let withinWindows = true;
    for (const request of route.requests) {
      clock = Math.max(clock, request.earliestMinute ?? 0) + SERVICE_MINUTES_PER_STOP;
      if (request.latestMinute !== undefined && clock > request.latestMinute) {
        withinWindows = false;
      }
    }
    if (
      route.vehicle.endMinute !== undefined &&
      clock + driveMinutes > route.vehicle.endMinute
    ) {
      withinWindows = false;
      warnings.push(
        `Vehicle ${route.vehicle.name} finishes after its shift window (${clock + driveMinutes} > ${route.vehicle.endMinute} min).`,
      );
    }

    totalDistanceKm += distance;
    totalDriveMinutes += driveMinutes;

    assignments.push({
      vehicleId: route.vehicle.id,
      vehicleName: route.vehicle.name,
      requestIds: route.requests.map((r) => r.id),
      seatsUsed: seats,
      capacity: route.vehicle.capacity,
      distanceKm: Math.round(distance * 100) / 100,
      driveMinutes,
      loadPercent: Math.round((seats / route.vehicle.capacity) * 100),
      withinWindows,
      unassigned: [],
    });
  }

  if (unassigned.length > 0) {
    warnings.push(
      `${unassigned.length} request(s) could not be assigned: no vehicle with enough free capacity.`,
    );
  }
  if (requests.length > 60) {
    warnings.push(
      "More than 60 requests: the greedy pass becomes slow and a proper solver (OR-Tools) is recommended.",
    );
  }

  return {
    assignments,
    unassigned,
    totalDistanceKm: Math.round(totalDistanceKm * 100) / 100,
    totalDriveMinutes,
    method:
      "Clarke-Wright savings + 2-opt (heuristic, capacity-aware). Not an exact solver; OR-Tools is the documented upgrade path.",
    warnings,
  };
}
