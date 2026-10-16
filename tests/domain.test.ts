import { strict as assert } from "node:assert";
import test from "node:test";
import {
  canAssignToTrip,
  canTransition,
  computeCharge,
  computeDriverPay,
  departureTimeForShift,
  haversineKm,
  isOnTime,
  planRoute,
  recommendDriver,
  recommendVehicle,
  validateBooking,
} from "../src/lib/domain.ts";

test("duplicate bookings for the same employee, date and leg are rejected", () => {
  const existing = [{ employeeId: 1, direction: "home_to_office", bookingDate: "2026-03-02", status: "assigned" }];
  const result = validateBooking({ employeeId: 1, direction: "home_to_office", bookingDate: "2026-03-02", seats: 1, existing });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "E_DUPLICATE");
});

test("a cancelled booking does not block a new request for the same day", () => {
  const existing = [{ employeeId: 1, direction: "home_to_office", bookingDate: "2026-03-02", status: "cancelled" }];
  const result = validateBooking({ employeeId: 1, direction: "home_to_office", bookingDate: "2026-03-02", seats: 1, existing });
  assert.equal(result.ok, true);
});

test("the opposite leg on the same day is allowed", () => {
  const existing = [{ employeeId: 1, direction: "home_to_office", bookingDate: "2026-03-02", status: "assigned" }];
  const result = validateBooking({ employeeId: 1, direction: "office_to_home", bookingDate: "2026-03-02", seats: 1, existing });
  assert.equal(result.ok, true);
});

test("only one seat per employee is permitted", () => {
  const result = validateBooking({ employeeId: 2, direction: "home_to_office", bookingDate: "2026-03-02", seats: 2, existing: [] });
  assert.equal(result.ok, false);
});

test("trip capacity is enforced", () => {
  const trip = { id: 1, capacity: 14, bookedSeats: 13, status: "scheduled", tripDate: "2026-03-02", direction: "home_to_office" };
  assert.equal(canAssignToTrip(trip, 1, "2026-03-02").ok, true);
  const full = { ...trip, bookedSeats: 14 };
  const over = canAssignToTrip(full, 1, "2026-03-02");
  assert.equal(over.ok, false);
  if (!over.ok) assert.equal(over.code, "E_CAPACITY");
  const wrongDay = canAssignToTrip(trip, 1, "2026-03-03");
  assert.equal(wrongDay.ok, false);
});

test("closed trips cannot accept passengers", () => {
  const cancelled = { id: 1, capacity: 14, bookedSeats: 2, status: "cancelled", tripDate: "2026-03-02", direction: "home_to_office" };
  const result = canAssignToTrip(cancelled, 1, "2026-03-02");
  assert.equal(result.ok, false);
});

test("trip status transitions follow the state machine", () => {
  assert.equal(canTransition("scheduled", "in_progress"), true);
  assert.equal(canTransition("in_progress", "completed"), true);
  assert.equal(canTransition("completed", "in_progress"), false);
  assert.equal(canTransition("cancelled", "in_progress"), false);
});

test("vehicle recommendation picks the smallest suitable available vehicle", () => {
  const fleet = [
    { id: 1, capacity: 33, status: "available", costPerKm: 1.5 },
    { id: 2, capacity: 14, status: "available", costPerKm: 0.9 },
    { id: 3, capacity: 4, status: "available", costPerKm: 0.55 },
    { id: 4, capacity: 18, status: "under_maintenance", costPerKm: 1.1 },
  ];
  assert.equal(recommendVehicle(fleet, 12)?.id, 2);
  assert.equal(recommendVehicle(fleet, 3)?.id, 3);
  assert.equal(recommendVehicle(fleet, 40), null);
});

test("driver recommendation excludes unavailable drivers and prefers ratings", () => {
  const pool = [
    { id: 1, status: "available", ratingAvg: 4.2 },
    { id: 2, status: "unavailable", ratingAvg: 5 },
    { id: 3, status: "available", ratingAvg: 4.9 },
  ];
  assert.equal(recommendDriver(pool)?.id, 3);
  assert.equal(recommendDriver([{ id: 9, status: "off_duty", ratingAvg: 4 }]), null);
});

test("route planner orders pickups and reports distance/duration", () => {
  const office = { id: 0, name: "HQ", lat: 5.6037, lng: -0.187 };
  const points = [
    { id: 1, name: "Dansoman", lat: 5.548, lng: -0.241 },
    { id: 2, name: "Lapaz", lat: 5.612, lng: -0.231 },
    { id: 3, name: "Achimota", lat: 5.6218, lng: -0.2135 },
  ];
  const plan = planRoute(points, office, { direction: "home_to_office", avgSpeedKph: 30, minutesPerStop: 3 });
  assert.equal(plan.stops.length, 3);
  assert.equal(plan.stops[0].sequence, 1);
  assert.ok(plan.totalKm > 5 && plan.totalKm < 40);
  assert.ok(plan.totalMinutes > 20 && plan.totalMinutes < 180);
  // offsets are monotonically increasing
  for (let i = 1; i < plan.stops.length; i += 1) {
    assert.ok(plan.stops[i].offsetMinutes > plan.stops[i - 1].offsetMinutes);
  }
});

test("haversine distance sanity check", () => {
  const a = { id: 0, name: "a", lat: 5.6037, lng: -0.187 };
  const b = { id: 1, name: "b", lat: 5.6698, lng: -0.0166 };
  const km = haversineKm(a, b);
  assert.ok(km > 15 && km < 25, `unexpected distance ${km}`);
});

test("departure time is back-calculated from shift start", () => {
  assert.equal(departureTimeForShift("08:00", 60, 10), "06:50");
  assert.equal(departureTimeForShift("17:30", 45, 0), "16:45");
});

test("billing models compute the correct charge basis", () => {
  assert.equal(computeCharge({ pricingModel: "per_passenger", unitRate: 18.5, seats: 10, distanceKm: 20, trips: 2 }).amount, 185);
  assert.equal(computeCharge({ pricingModel: "per_trip", unitRate: 450, seats: 10, distanceKm: 20, trips: 2 }).amount, 900);
  assert.equal(computeCharge({ pricingModel: "distance_based", unitRate: 7.2, seats: 10, distanceKm: 30, trips: 2 }).amount, 216);
  assert.equal(computeCharge({ pricingModel: "monthly_fixed", unitRate: 0, seats: 10, distanceKm: 30, trips: 2 }).amount, 0);
});

test("driver pay includes overtime and allowances", () => {
  const pay = computeDriverPay({ basePay: 85, allowance: 35, overtimeMinutes: 90, overtimeRatePerHour: 30 });
  assert.equal(pay.overtimePay, 45);
  assert.equal(pay.total, 165);
});

test("on-time performance uses a grace window", () => {
  const scheduled = "2026-03-02T07:00:00Z";
  assert.equal(isOnTime("2026-03-02T07:05:00Z", scheduled, 10), true);
  assert.equal(isOnTime("2026-03-02T07:20:00Z", scheduled, 10), false);
  assert.equal(isOnTime(null, scheduled), false);
});
