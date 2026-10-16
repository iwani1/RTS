/**
 * Role based access control matrix.
 * Sections are the navigation / capability groups used across the app.
 */
export type Role =
  | "super_admin"
  | "ops_manager"
  | "dispatcher"
  | "corporate_admin"
  | "fleet_manager"
  | "driver"
  | "employee"
  | "finance_officer";

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Administrator",
  ops_manager: "Operations Manager",
  dispatcher: "Dispatcher",
  corporate_admin: "Corporate HR Administrator",
  fleet_manager: "Fleet Manager",
  driver: "Driver",
  employee: "Employee / Passenger",
  finance_officer: "Finance Officer",
};

/** Sections = coarse grained feature areas. */
export type Section =
  | "dashboard"
  | "companies"
  | "employees"
  | "fleet"
  | "drivers"
  | "routes"
  | "trips"
  | "dispatch"
  | "bookings"
  | "finance"
  | "reports"
  | "incidents"
  | "audit"
  | "settings"
  | "passenger"
  | "driverapp"
  | "calendar"
  | "compliance"
  | "operations"
  | "currencies";

export const MATRIX: Record<Section, Role[]> = {
  dashboard: ["super_admin", "ops_manager", "dispatcher", "corporate_admin", "fleet_manager", "finance_officer"],
  companies: ["super_admin", "ops_manager"],
  employees: ["super_admin", "ops_manager", "corporate_admin"],
  fleet: ["super_admin", "fleet_manager", "ops_manager"],
  drivers: ["super_admin", "fleet_manager", "ops_manager", "finance_officer"],
  routes: ["super_admin", "ops_manager", "dispatcher", "corporate_admin"],
  trips: ["super_admin", "ops_manager", "dispatcher", "corporate_admin"],
  dispatch: ["super_admin", "ops_manager", "dispatcher"],
  bookings: ["super_admin", "ops_manager", "dispatcher", "corporate_admin"],
  finance: ["super_admin", "finance_officer", "corporate_admin"],
  reports: ["super_admin", "ops_manager", "finance_officer", "corporate_admin"],
  incidents: ["super_admin", "ops_manager", "dispatcher", "fleet_manager", "corporate_admin"],
  audit: ["super_admin"],
  settings: ["super_admin", "ops_manager", "dispatcher", "corporate_admin", "fleet_manager", "finance_officer", "driver", "employee"],
  passenger: ["employee", "corporate_admin"],
  driverapp: ["driver"],
  calendar: ["super_admin", "ops_manager", "dispatcher"],
  compliance: ["super_admin", "ops_manager", "fleet_manager"],
  operations: ["super_admin", "ops_manager"],
  currencies: ["super_admin", "finance_officer"],
};

export function canAccess(role: Role, section: Section): boolean {
  return MATRIX[section]?.includes(role) ?? false;
}

/** Fine-grained action permissions used for server side authorisation. */
export type Permission =
  | "company.manage"
  | "employee.manage"
  | "vehicle.manage"
  | "driver.manage"
  | "route.manage"
  | "trip.manage"
  | "trip.dispatch"
  | "booking.approve"
  | "booking.own"
  | "finance.manage"
  | "incident.manage"
  | "incident.report"
  | "audit.view"
  | "user.manage"
  | "driver.duty";

export const PERMISSIONS: Record<Permission, Role[]> = {
  "company.manage": ["super_admin", "ops_manager"],
  "employee.manage": ["super_admin", "ops_manager", "corporate_admin"],
  "vehicle.manage": ["super_admin", "fleet_manager"],
  "driver.manage": ["super_admin", "fleet_manager"],
  "route.manage": ["super_admin", "ops_manager", "dispatcher"],
  "trip.manage": ["super_admin", "ops_manager", "dispatcher"],
  "trip.dispatch": ["super_admin", "ops_manager", "dispatcher"],
  "booking.approve": ["super_admin", "ops_manager", "dispatcher", "corporate_admin"],
  "booking.own": ["employee", "corporate_admin"],
  "finance.manage": ["super_admin", "finance_officer"],
  "incident.manage": ["super_admin", "ops_manager", "dispatcher", "fleet_manager"],
  "incident.report": ["super_admin", "ops_manager", "dispatcher", "fleet_manager", "driver", "employee"],
  "audit.view": ["super_admin"],
  "user.manage": ["super_admin", "ops_manager"],
  "driver.duty": ["driver"],
};

export function can(role: Role, permission: Permission): boolean {
  return PERMISSIONS[permission]?.includes(role) ?? false;
}

export const ALL_ROLES = Object.keys(ROLE_LABELS) as Role[];
export const ADMIN_ROLES: Role[] = [
  "super_admin",
  "ops_manager",
  "dispatcher",
  "corporate_admin",
  "fleet_manager",
  "finance_officer",
];
