/**
 * Enterprise Staff Transportation Management System (TMS)
 * PostgreSQL schema (Drizzle ORM)
 *
 * Design notes
 *  - Every operational row is scoped to a `companyId` where the data belongs to a
 *    corporate client, which is the primary tenant-isolation boundary.
 *  - Money is stored as numeric(12,2) and rendered in GHS by default.
 *  - All tables carry created/updated timestamps and FK constraints with indexes
 *    on the hot lookup paths (tenant, date, status, trip).
 */
import {
  type AnyPgColumn,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  time,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ enums */

/**
 * The roles a person can sign in with.
 *
 * "employee" (the passenger) and "corporate_admin" (the client portal) are
 * retired for now: they are out of the permission matrix, out of the
 * navigation and out of the seed, and migration 0005 removes their accounts.
 * The values stay in the enum, dormant, so that switching either role back
 * on is a change to the matrix rather than a change to the schema.
 */
export const userRoleEnum = pgEnum("user_role", [
  "super_admin",
  "ops_manager",
  "dispatcher",
  "corporate_admin",
  "fleet_manager",
  "driver",
  "employee",
  "finance_officer",
]);

export const userStatusEnum = pgEnum("user_status", [
  "pending",
  "active",
  "suspended",
]);

export const companyStatusEnum = pgEnum("company_status", [
  "active",
  "suspended",
  "inactive",
]);

export const billingModelEnum = pgEnum("billing_model", [
  "per_trip",
  "per_passenger",
  "monthly_fixed",
  "distance_based",
]);

export const directionEnum = pgEnum("trip_direction", [
  "home_to_office",
  "office_to_home",
  "inter_office",
  "ad_hoc",
]);

export const tripStatusEnum = pgEnum("trip_status", [
  "scheduled",
  "dispatching",
  "in_progress",
  "completed",
  "delayed",
  "breakdown",
  "cancelled",
]);

export const bookingStatusEnum = pgEnum("booking_status", [
  "pending",
  "approved",
  "waitlisted",
  "assigned",
  "in_progress",
  "completed",
  "no_show",
  "cancelled",
  "rejected",
]);

export const vehicleStatusEnum = pgEnum("vehicle_status", [
  "available",
  "assigned",
  "on_trip",
  "under_maintenance",
  "out_of_service",
]);

export const driverStatusEnum = pgEnum("driver_status", [
  "available",
  "on_trip",
  "off_duty",
  "unavailable",
]);

export const incidentTypeEnum = pgEnum("incident_type", [
  "breakdown",
  "accident",
  "sos",
  "missed_pickup",
  "delay",
  "no_show",
  "complaint",
  "safety",
]);

export const incidentSeverityEnum = pgEnum("incident_severity", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const incidentStatusEnum = pgEnum("incident_status", [
  "open",
  "acknowledged",
  "resolved",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "issued",
  "paid",
  "partial",
  "overdue",
  "void",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "bank_transfer",
  "mobile_money",
  "paystack",
  "flutterwave",
  "cash",
  "cheque",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "successful",
  "failed",
]);

export const recurringEnum = pgEnum("recurring_rule", [
  "none",
  "daily",
  "weekly",
  "monthly",
]);

export const earningsStatusEnum = pgEnum("earnings_status", [
  "accrued",
  "approved",
  "paid",
]);

/* ------------------------------------------- enums added for prompt parity */

export const addressLabelEnum = pgEnum("address_label", [
  "home",
  "office",
  "other",
]);

export const assignmentRoleEnum = pgEnum("assignment_role", [
  "primary",
  "relief",
  "overflow",
]);

export const inspectionTypeEnum = pgEnum("inspection_type", [
  "roadworthiness",
  "annual",
  "spot",
  "pre_departure",
]);

export const inspectionResultEnum = pgEnum("inspection_result", [
  "pass",
  "conditional",
  "fail",
]);

export const otpPurposeEnum = pgEnum("otp_purpose", [
  "login",
  "password_reset",
  "two_factor",
  "boarding",
]);

export const otpChannelEnum = pgEnum("otp_channel", [
  "sms",
  "email",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "running",
  "succeeded",
  "failed",
]);

const money = (name: string) => numeric(name, { precision: 12, scale: 2 });

/* -------------------------------------------------------------- companies */

export const companies = pgTable(
  "companies",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    contactPerson: varchar("contact_person", { length: 120 }),
    email: varchar("email", { length: 160 }),
    phone: varchar("phone", { length: 40 }),
    industry: varchar("industry", { length: 80 }),
    city: varchar("city", { length: 80 }),
    billingModel: billingModelEnum("billing_model").notNull().default("per_passenger"),
    currency: varchar("currency", { length: 8 }).notNull().default("GHS"),
    monthlyRate: money("monthly_rate").default("0"),
    status: companyStatusEnum("status").notNull().default("active"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("companies_status_idx").on(t.status)],
);

export const branches = pgTable(
  "company_branches",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 140 }).notNull(),
    address: text("address"),
    city: varchar("city", { length: 80 }),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    isHeadquarters: boolean("is_headquarters").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("branches_company_idx").on(t.companyId)],
);

/* ------------------------------------------------------------------- users */

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 180 }).notNull().unique(),
    phone: varchar("phone", { length: 40 }),
    fullName: varchar("full_name", { length: 140 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("driver"),
    status: userStatusEnum("status").notNull().default("active"),
    companyId: integer("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
    twoFactorCode: varchar("two_factor_code", { length: 12 }),
    /** Base32 TOTP shared secret (RFC 6238). Null until the user enrols. */
    totpSecret: varchar("totp_secret", { length: 64 }),
    totpEnabled: boolean("totp_enabled").notNull().default(false),
    /** Identity provider key and subject for SSO sign-in. */
    ssoProvider: varchar("sso_provider", { length: 40 }),
    ssoSubject: varchar("sso_subject", { length: 160 }),
    invitationToken: varchar("invitation_token", { length: 80 }),
    invitedById: integer("invited_by_id"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("users_role_idx").on(t.role), index("users_company_idx").on(t.companyId)],
);

export const sessions = pgTable(
  "sessions",
  {
    /**
     * SHA-256 of the bearer token, never the token itself. The raw token only
     * ever exists in the client cookie; a database leak cannot be replayed.
     */
    tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ip: varchar("ip", { length: 64 }),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const passwordResets = pgTable(
  "password_resets",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 96 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("password_resets_user_idx").on(t.userId)],
);

/* --------------------------------------------------------------- employees */

export const shifts = pgTable(
  "employee_shifts",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    branchId: integer("branch_id").references(() => branches.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 80 }).notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    graceMinutes: integer("grace_minutes").notNull().default(15),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("shifts_company_idx").on(t.companyId)],
);

export const employees = pgTable(
  "employees",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    branchId: integer("branch_id").references(() => branches.id, {
      onDelete: "set null",
    }),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    shiftId: integer("shift_id").references(() => shifts.id, { onDelete: "set null" }),
    employeeCode: varchar("employee_code", { length: 40 }).notNull(),
    fullName: varchar("full_name", { length: 140 }).notNull(),
    email: varchar("email", { length: 180 }),
    phone: varchar("phone", { length: 40 }),
    department: varchar("department", { length: 100 }),
    jobTitle: varchar("job_title", { length: 100 }),
    homeAddress: text("home_address"),
    homeLat: doublePrecision("home_lat"),
    homeLng: doublePrecision("home_lng"),
    primaryAddressId: integer("primary_address_id").references(
      (): AnyPgColumn => addresses.id,
      { onDelete: "set null" },
    ),
    zone: varchar("zone", { length: 80 }),
    vip: boolean("vip").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("employees_company_idx").on(t.companyId),
    unique("employees_company_code_unique").on(t.companyId, t.employeeCode),
  ],
);

/* -------------------------------------------------------- routes &  stops */

export const stops = pgTable(
  "stops",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 140 }).notNull(),
    zone: varchar("zone", { length: 80 }),
    address: text("address"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("stops_company_idx").on(t.companyId)],
);

export const routes = pgTable(
  "routes",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    branchId: integer("branch_id").references(() => branches.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 140 }).notNull(),
    direction: directionEnum("direction").notNull().default("home_to_office"),
    zone: varchar("zone", { length: 80 }),
    estimatedKm: doublePrecision("estimated_km").default(0),
    estimatedMinutes: integer("estimated_minutes").default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("routes_company_idx").on(t.companyId)],
);

export const routeStops = pgTable(
  "route_stops",
  {
    id: serial("id").primaryKey(),
    routeId: integer("route_id")
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    stopId: integer("stop_id")
      .notNull()
      .references(() => stops.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    offsetMinutes: integer("offset_minutes").notNull().default(0),
  },
  (t) => [unique("route_stop_seq_unique").on(t.routeId, t.stopId, t.sequence)],
);

/* ------------------------------------------------------------ fleet/ staff */

export const vehicles = pgTable(
  "vehicles",
  {
    id: serial("id").primaryKey(),
    registrationNo: varchar("registration_no", { length: 30 }).notNull().unique(),
    make: varchar("make", { length: 60 }).notNull(),
    model: varchar("model", { length: 60 }).notNull(),
    year: integer("year"),
    photoUrl: text("photo_url"),
    capacity: integer("capacity").notNull(),
    standingCapacity: integer("standing_capacity").default(0),
    vehicleType: varchar("vehicle_type", { length: 40 }).notNull().default("minibus"),
    fuelType: varchar("fuel_type", { length: 30 }).notNull().default("diesel"),
    color: varchar("color", { length: 40 }),
    chassisNumber: varchar("chassis_number", { length: 60 }),
    engineNumber: varchar("engine_number", { length: 60 }),
    ownership: varchar("ownership", { length: 30 }).notNull().default("owned"),
    assignedCompanyId: integer("assigned_company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    assignedDriverId: integer("assigned_driver_id"),
    odometerKm: integer("odometer_km").default(0),
    currentMileage: integer("current_mileage").default(0),
    avgKmPerLitre: doublePrecision("avg_km_per_litre").default(0),
    fuelConsumptionPerKm: doublePrecision("fuel_consumption_per_km").default(0),
    lastServiceDate: date("last_service_date"),
    nextServiceDueDate: date("next_service_due_date"),
    insuranceExpiry: date("insurance_expiry"),
    roadworthinessExpiry: date("roadworthiness_expiry"),
    registrationExpiry: date("registration_expiry"),
    status: vehicleStatusEnum("status").notNull().default("available"),
    costPerKm: money("cost_per_km").default("0"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("vehicles_status_idx").on(t.status)],
);

export const drivers = pgTable(
  "drivers",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    companyId: integer("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    fullName: varchar("full_name", { length: 140 }).notNull(),
    phone: varchar("phone", { length: 40 }).notNull(),
    email: varchar("email", { length: 180 }),
    licenseNo: varchar("license_no", { length: 60 }).notNull(),
    licenseClass: varchar("license_class", { length: 30 }),
    licenseExpiry: date("license_expiry"),
    status: driverStatusEnum("status").notNull().default("available"),
    baseSalary: money("base_salary").default("0"),
    tripAllowance: money("trip_allowance").default("0"),
    ratingAvg: doublePrecision("rating_avg").default(5),
    ratingCount: integer("rating_count").default(0),
    totalTrips: integer("total_trips").default(0),
    isAvailable: boolean("is_available").notNull().default(true),
    dateOfBirth: date("date_of_birth"),
    profileImageUrl: text("profile_image_url"),
    emergencyContactName: varchar("emergency_contact_name", { length: 120 }),
    emergencyContactPhone: varchar("emergency_contact_phone", { length: 40 }),
    hiredAt: date("hired_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("drivers_status_idx").on(t.status)],
);

export const driverShifts = pgTable(
  "driver_shifts",
  {
    id: serial("id").primaryKey(),
    driverId: integer("driver_id")
      .notNull()
      .references(() => drivers.id, { onDelete: "cascade" }),
    shiftDate: date("shift_date").notNull(),
    label: varchar("label", { length: 40 }).notNull().default("morning"),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    status: varchar("status", { length: 30 }).notNull().default("planned"),
  },
  (t) => [index("driver_shifts_date_idx").on(t.shiftDate, t.driverId)],
);

export const maintenanceRecords = pgTable(
  "maintenance_records",
  {
    id: serial("id").primaryKey(),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 40 }).notNull().default("preventive"),
    description: text("description").notNull(),
    cost: money("cost").default("0"),
    odometerKm: integer("odometer_km"),
    serviceDate: date("service_date").notNull(),
    nextServiceDate: date("next_service_date"),
    garageName: varchar("garage_name", { length: 120 }),
    status: varchar("status", { length: 30 }).notNull().default("completed"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("maintenance_vehicle_idx").on(t.vehicleId)],
);

/* ---------------------------------------------------- trips & assignments */

export const trips = pgTable(
  "trips",
  {
    id: serial("id").primaryKey(),
    reference: varchar("reference", { length: 30 }).notNull().unique(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    branchId: integer("branch_id").references(() => branches.id, {
      onDelete: "set null",
    }),
    routeId: integer("route_id").references(() => routes.id, { onDelete: "set null" }),
    vehicleId: integer("vehicle_id").references(() => vehicles.id, {
      onDelete: "set null",
    }),
    driverId: integer("driver_id").references(() => drivers.id, {
      onDelete: "set null",
    }),
    direction: directionEnum("direction").notNull().default("home_to_office"),
    tripDate: date("trip_date").notNull(),
    scheduledDeparture: timestamp("scheduled_departure", { withTimezone: true }).notNull(),
    scheduledArrival: timestamp("scheduled_arrival", { withTimezone: true }),
    actualDeparture: timestamp("actual_departure", { withTimezone: true }),
    actualArrival: timestamp("actual_arrival", { withTimezone: true }),
    status: tripStatusEnum("status").notNull().default("scheduled"),
    capacity: integer("capacity").notNull().default(0),
    bookedSeats: integer("booked_seats").notNull().default(0),
    currentOccupancy: integer("current_occupancy").notNull().default(0),
    waitingMinutes: integer("waiting_minutes").notNull().default(0),
    overtimeMinutes: integer("overtime_minutes").notNull().default(0),
    shiftId: integer("shift_id").references(() => shifts.id, { onDelete: "set null" }),
    plannedKm: doublePrecision("planned_km").default(0),
    notes: text("notes"),
    createdById: integer("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("trips_date_status_idx").on(t.tripDate, t.status),
    index("trips_company_idx").on(t.companyId),
    index("trips_driver_idx").on(t.driverId),
  ],
);

export const bookings = pgTable(
  "bookings",
  {
    id: serial("id").primaryKey(),
    reference: varchar("reference", { length: 30 }).notNull().unique(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    tripId: integer("trip_id").references(() => trips.id, { onDelete: "set null" }),
    routeId: integer("route_id").references(() => routes.id, { onDelete: "set null" }),
    direction: directionEnum("direction").notNull().default("home_to_office"),
    bookingDate: date("booking_date").notNull(),
    pickupAddress: text("pickup_address"),
    dropoffAddress: text("dropoff_address"),
    pickupStopId: integer("pickup_stop_id").references(() => stops.id, {
      onDelete: "set null",
    }),
    requestedTime: time("requested_time"),
    pickupTime: time("pickup_time"),
    actualPickupTime: timestamp("actual_pickup_time", { withTimezone: true }),
    actualDropoffTime: timestamp("actual_dropoff_time", { withTimezone: true }),
    seats: integer("seats").notNull().default(1),
    status: bookingStatusEnum("status").notNull().default("pending"),
    recurring: recurringEnum("recurring").notNull().default("none"),
    recurrenceEndDate: date("recurrence_end_date"),
    otpCode: varchar("otp_code", { length: 8 }),
    otpVerified: boolean("otp_verified").notNull().default(false),
    otpExpiresAt: timestamp("otp_expires_at", { withTimezone: true }),
    waitlistedAt: timestamp("waitlisted_at", { withTimezone: true }),
    vip: boolean("vip").notNull().default(false),
    notes: text("notes"),
    approvedById: integer("approved_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("bookings_company_date_idx").on(t.companyId, t.bookingDate),
    index("bookings_employee_idx").on(t.employeeId),
    index("bookings_trip_idx").on(t.tripId),
    index("bookings_status_idx").on(t.status),
  ],
);

export const boardings = pgTable(
  "passenger_boardings",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    tripId: integer("trip_id").references(() => trips.id, { onDelete: "cascade" }),
    boardedAt: timestamp("boarded_at", { withTimezone: true }),
    alightedAt: timestamp("alighted_at", { withTimezone: true }),
    noShow: boolean("no_show").notNull().default(false),
    otpVerified: boolean("otp_verified").notNull().default(false),
    recordedById: integer("recorded_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("boardings_booking_unique").on(t.bookingId, t.tripId),
    index("boardings_trip_idx").on(t.tripId),
  ],
);

export const gpsEvents = pgTable(
  "gps_events",
  {
    id: serial("id").primaryKey(),
    tripId: integer("trip_id").references(() => trips.id, { onDelete: "cascade" }),
    vehicleId: integer("vehicle_id").references(() => vehicles.id, {
      onDelete: "cascade",
    }),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    speedKph: doublePrecision("speed_kph").default(0),
    heading: integer("heading").default(0),
    source: varchar("source", { length: 30 }).notNull().default("driver_app"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("gps_trip_idx").on(t.tripId, t.recordedAt),
    index("gps_recorded_idx").on(t.recordedAt),
  ],
);

export const feedback = pgTable(
  "feedback",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").references(() => companies.id, {
      onDelete: "cascade",
    }),
    employeeId: integer("employee_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    tripId: integer("trip_id").references(() => trips.id, { onDelete: "set null" }),
    bookingId: integer("booking_id").references(() => bookings.id, {
      onDelete: "set null",
    }),
    category: varchar("category", { length: 30 }).notNull().default("feedback"),
    rating: integer("rating"),
    comments: text("comments"),
    status: varchar("status", { length: 30 }).notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("feedback_company_idx").on(t.companyId)],
);

/* ---------------------------------------------------------------- finance */

export const serviceAgreements = pgTable(
  "service_agreements",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 140 }).notNull(),
    pricingModel: billingModelEnum("pricing_model").notNull().default("per_passenger"),
    unitRate: money("unit_rate").default("0"),
    fixedMonthlyAmount: money("fixed_monthly_amount").default("0"),
    currency: varchar("currency", { length: 8 }).notNull().default("GHS"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    slaOnTimePercent: doublePrecision("sla_on_time_percent").default(95),
    slaResponseMinutes: integer("sla_response_minutes").default(15),
    maxPickupDeviationMinutes: integer("max_pickup_deviation_minutes").default(10),
    cancellationPolicyHours: integer("cancellation_policy_hours").default(2),
    /** Charge per hour of waiting time accrued on a trip. */
    waitingChargePerHour: money("waiting_charge_per_hour").default("0"),
    /** Charge per hour a trip runs beyond its scheduled arrival. */
    overtimeChargePerHour: money("overtime_charge_per_hour").default("0"),
    /** Flat charge applied to every ad-hoc / emergency trip. */
    extraTripCharge: money("extra_trip_charge").default("250.00"),
    status: varchar("status", { length: 30 }).notNull().default("active"),
    /** Day of the month the monthly invoice is raised by the scheduler. */
    billingDay: integer("billing_day").notNull().default(1),
    /** Whether the scheduler may raise invoices for this agreement. */
    autoInvoice: boolean("auto_invoice").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("agreements_company_idx").on(t.companyId)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    invoiceNo: varchar("invoice_no", { length: 40 }).notNull().unique(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    subtotal: money("subtotal").notNull().default("0"),
    tax: money("tax").notNull().default("0"),
    discount: money("discount").notNull().default("0"),
    total: money("total").notNull().default("0"),
    amountPaid: money("amount_paid").notNull().default("0"),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    currency: varchar("currency", { length: 8 }).notNull().default("GHS"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    dueDate: date("due_date"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("invoices_company_idx").on(t.companyId, t.status)],
);

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    category: varchar("category", { length: 40 }).notNull().default("transport"),
    quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
    unitPrice: money("unit_price").notNull().default("0"),
    amount: money("amount").notNull().default("0"),
  },
  (t) => [index("invoice_lines_invoice_idx").on(t.invoiceId)],
);

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    invoiceId: integer("invoice_id").references(() => invoices.id, {
      onDelete: "set null",
    }),
    amount: money("amount").notNull().default("0"),
    method: paymentMethodEnum("method").notNull().default("bank_transfer"),
    reference: varchar("reference", { length: 80 }),
    status: paymentStatusEnum("status").notNull().default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    notes: text("notes"),
    recordedById: integer("recorded_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("payments_company_idx").on(t.companyId)],
);

export const driverEarnings = pgTable(
  "driver_earnings",
  {
    id: serial("id").primaryKey(),
    driverId: integer("driver_id")
      .notNull()
      .references(() => drivers.id, { onDelete: "cascade" }),
    tripId: integer("trip_id").references(() => trips.id, { onDelete: "set null" }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    basePay: money("base_pay").notNull().default("0"),
    overtimePay: money("overtime_pay").notNull().default("0"),
    allowance: money("allowance").notNull().default("0"),
    deduction: money("deduction").notNull().default("0"),
    total: money("total").notNull().default("0"),
    status: earningsStatusEnum("status").notNull().default("accrued"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [index("earnings_driver_idx").on(t.driverId, t.periodStart)],
);

/* ------------------------------------------------ safety / ops / audit */

export const incidents = pgTable(
  "incidents",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").references(() => companies.id, {
      onDelete: "cascade",
    }),
    tripId: integer("trip_id").references(() => trips.id, { onDelete: "set null" }),
    vehicleId: integer("vehicle_id").references(() => vehicles.id, {
      onDelete: "set null",
    }),
    driverId: integer("driver_id").references(() => drivers.id, {
      onDelete: "set null",
    }),
    reportedById: integer("reported_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    type: incidentTypeEnum("type").notNull(),
    severity: incidentSeverityEnum("severity").notNull().default("medium"),
    status: incidentStatusEnum("status").notNull().default("open"),
    description: text("description").notNull(),
    actionTaken: text("action_taken"),
    location: text("location"),
    reportedAt: timestamp("reported_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    index("incidents_status_idx").on(t.status),
    index("incidents_company_idx").on(t.companyId),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
    companyId: integer("company_id").references(() => companies.id, {
      onDelete: "cascade",
    }),
    channel: varchar("channel", { length: 20 }).notNull().default("in_app"),
    category: varchar("category", { length: 40 }).notNull().default("general"),
    title: varchar("title", { length: 160 }).notNull(),
    body: text("body"),
    bookingId: integer("booking_id").references(() => bookings.id, {
      onDelete: "cascade",
    }),
    tripId: integer("trip_id").references(() => trips.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    /**
     * How the notification was delivered. Without an SMS, email or push
     * provider configured the row is still created in-app and the status
     * says so — the app never pretends a message left the building.
     */
    deliveryStatus: varchar("delivery_status", { length: 20 }).notNull().default("delivered"),
    /** Provider message id, when a real provider accepted the message. */
    providerRef: varchar("provider_ref", { length: 80 }),
    /** Why a delivery failed, in words an operator can act on. */
    deliveryError: text("delivery_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    actorEmail: varchar("actor_email", { length: 180 }),
    action: varchar("action", { length: 80 }).notNull(),
    entity: varchar("entity", { length: 60 }).notNull(),
    entityId: varchar("entity_id", { length: 40 }),
    companyId: integer("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    details: jsonb("details"),
    ip: varchar("ip", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("audit_created_idx").on(t.createdAt),
    index("audit_company_idx").on(t.companyId),
  ],
);

export type Company = typeof companies.$inferSelect;
export type User = typeof users.$inferSelect;
export type Employee = typeof employees.$inferSelect;
export type Vehicle = typeof vehicles.$inferSelect;
export type Driver = typeof drivers.$inferSelect;
export type Route = typeof routes.$inferSelect;
export type Trip = typeof trips.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Incident = typeof incidents.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;

/* ==========================================================================
   ADDED TABLES
   Ported from the second supplied implementation and extended to close the
   gaps identified in the master build prompt:
     - roles / permissions / role_permissions / user_roles  (prompt §5, required)
     - addresses                                            (prompt §5, required)
     - trip_assignments                                     (prompt §5, required)
     - fuel_logs, safety_inspections                        (modules 5 & 11)
     - location_consents                                    (module 9, privacy)
     - otp_codes, login_attempts                            (module 1, auth)
     - job_runs, saved_views                                (§6 background jobs, §12 filters)
   ========================================================================== */

/* ------------------------------------------------- normalised role model */

export const roles = pgTable(
  "roles",
  {
    id: serial("id").primaryKey(),
    /** Stable machine key, mirrors the `user_role` enum value. */
    key: varchar("key", { length: 40 }).notNull().unique(),
    name: varchar("name", { length: 80 }).notNull(),
    description: text("description"),
    /** System roles may not be deleted; they are seeded from the RBAC matrix. */
    isSystem: boolean("is_system").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("roles_key_idx").on(t.key)],
);

export const permissions = pgTable(
  "permissions",
  {
    id: serial("id").primaryKey(),
    /** `resource.action`, e.g. `trip.dispatch`. */
    key: varchar("key", { length: 80 }).notNull().unique(),
    resource: varchar("resource", { length: 40 }).notNull(),
    action: varchar("action", { length: 40 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("permissions_resource_idx").on(t.resource, t.action),
  ],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: integer("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
    grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    /** Optional tenant scope: a corporate HR user granted a role for one client. */
    companyId: integer("company_id").references(() => companies.id, {
      onDelete: "cascade",
    }),
    assignedById: integer("assigned_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.roleId] }),
    index("user_roles_user_idx").on(t.userId),
  ],
);

/* ------------------------------------------------------------- addresses */

export const addresses = pgTable(
  "addresses",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    label: addressLabelEnum("label").notNull().default("home"),
    line1: text("line1").notNull(),
    line2: text("line2"),
    city: varchar("city", { length: 80 }),
    zone: varchar("zone", { length: 80 }),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("addresses_employee_idx").on(t.employeeId),
    index("addresses_company_label_idx").on(t.label),
  ],
);

/* ------------------------------------------------------ trip assignments */

export const tripAssignments = pgTable(
  "trip_assignments",
  {
    id: serial("id").primaryKey(),
    tripId: integer("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    vehicleId: integer("vehicle_id").references(() => vehicles.id, {
      onDelete: "set null",
    }),
    driverId: integer("driver_id").references(() => drivers.id, {
      onDelete: "set null",
    }),
    role: assignmentRoleEnum("role").notNull().default("primary"),
    assignedById: integer("assigned_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
  },
  (t) => [
    index("trip_assignments_trip_idx").on(t.tripId),
    index("trip_assignments_vehicle_idx").on(t.vehicleId),
    index("trip_assignments_driver_idx").on(t.driverId),
  ],
);

/* --------------------------------------------------------- fuel & upkeep */

export const fuelLogs = pgTable(
  "fuel_logs",
  {
    id: serial("id").primaryKey(),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    tripId: integer("trip_id").references(() => trips.id, { onDelete: "set null" }),
    driverId: integer("driver_id").references(() => drivers.id, {
      onDelete: "set null",
    }),
    litres: doublePrecision("litres").notNull().default(0),
    cost: money("cost").notNull().default("0"),
    odometerKm: integer("odometer_km"),
    station: varchar("station", { length: 120 }),
    filledAt: timestamp("filled_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("fuel_logs_vehicle_idx").on(t.vehicleId, t.filledAt),
    index("fuel_logs_date_idx").on(t.filledAt),
  ],
);

export const safetyInspections = pgTable(
  "safety_inspections",
  {
    id: serial("id").primaryKey(),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    type: inspectionTypeEnum("type").notNull().default("roadworthiness"),
    result: inspectionResultEnum("result").notNull().default("pass"),
    certificateNo: varchar("certificate_no", { length: 60 }),
    inspector: varchar("inspector", { length: 120 }),
    notes: text("notes"),
    performedAt: date("performed_at").notNull(),
    nextDueAt: date("next_due_at"),
    createdById: integer("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("safety_inspections_vehicle_idx").on(t.vehicleId, t.performedAt),
    index("safety_inspections_due_idx").on(t.nextDueAt),
  ],
);

/* ------------------------------------------------- privacy & authorisation */

export const locationConsents = pgTable(
  "location_consents",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    granted: boolean("granted").notNull().default(false),
    /** Version of the consent copy the user agreed to. */
    policyVersion: varchar("policy_version", { length: 20 }).notNull().default("v1"),
    grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ip: varchar("ip", { length: 64 }),
  },
  (t) => [index("location_consents_user_idx").on(t.userId)],
);

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
    channel: otpChannelEnum("channel").notNull().default("sms"),
    purpose: otpPurposeEnum("purpose").notNull().default("login"),
    /** Only the hash is stored — the plaintext code is delivered out of band. */
    codeHash: varchar("code_hash", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("otp_codes_user_idx").on(t.userId, t.purpose),
    index("otp_codes_expiry_idx").on(t.expiresAt),
  ],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: serial("id").primaryKey(),
    /** The email or phone the attempt targeted. */
    identifier: varchar("identifier", { length: 180 }).notNull(),
    ip: varchar("ip", { length: 64 }),
    succeeded: boolean("succeeded").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("login_attempts_identifier_idx").on(t.identifier, t.createdAt)],
);

/* ------------------------------------------------------- jobs & saved views */

export const jobRuns = pgTable(
  "job_runs",
  {
    id: serial("id").primaryKey(),
    jobName: varchar("job_name", { length: 60 }).notNull(),
    status: jobStatusEnum("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    error: text("error"),
    detail: jsonb("detail"),
  },
  (t) => [index("job_runs_name_idx").on(t.jobName, t.startedAt)],
);

export const savedViews = pgTable(
  "saved_views",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    /** e.g. `trips`, `bookings`, `incidents` — which list the view applies to. */
    scope: varchar("scope", { length: 40 }).notNull(),
    filters: jsonb("filters").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("saved_views_user_idx").on(t.userId, t.scope)],
);

/* ------------------------------------------------- currencies & live sharing */

export const exchangeRates = pgTable(
  "exchange_rates",
  {
    /** ISO 4217 code, e.g. GHS, USD, EUR. */
    code: varchar("code", { length: 8 }).primaryKey(),
    name: varchar("name", { length: 80 }).notNull(),
    /** Units of this currency per one unit of the base currency (GHS). */
    rateToBase: numeric("rate_to_base", { precision: 18, scale: 8 }).notNull().default("1"),
    symbol: varchar("symbol", { length: 8 }).notNull().default("₵"),
    /** Exactly one row is the base currency; every other rate is relative to it. */
    isBase: boolean("is_base").notNull().default(false),
    asOf: date("as_of").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("exchange_rates_as_of_idx").on(t.asOf)],
);

/**
 * A passenger shares their trip with other passengers of the same corridor so
 * they can see how full the vehicle is. The share code is short-lived and
 * revocable, and sharing requires the sharer to have granted location consent.
 */
export const trackingShares = pgTable(
  "tracking_shares",
  {
    id: serial("id").primaryKey(),
    tripId: integer("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    /** The employee who created the share. */
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    /** Short code another passenger enters to see the corridor. */
    shareCode: varchar("share_code", { length: 16 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("tracking_shares_trip_idx").on(t.tripId),
    index("tracking_shares_employee_idx").on(t.employeeId),
  ],
);

export type RoleRecord = typeof roles.$inferSelect;
export type Address = typeof addresses.$inferSelect;
export type TripAssignment = typeof tripAssignments.$inferSelect;
export type SafetyInspection = typeof safetyInspections.$inferSelect;
