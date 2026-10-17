/**
 * Role based access control matrix.
 * Sections are the navigation / capability groups used across the app.
 *
 * Six roles run the service. The Employee/Passenger and the Corporate HR
 * roles are retired for now: their logins are refused, their screens are
 * gone, and the data they used — clients, branches, the staff register, trips
 * and bookings — is untouched, so either can be switched back on.
 */
export type Role =
  | "super_admin"
  | "ops_manager"
  | "dispatcher"
  | "fleet_manager"
  | "driver"
  | "finance_officer";

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Administrator",
  ops_manager: "Operations Manager",
  dispatcher: "Dispatcher",
  fleet_manager: "Fleet Manager",
  driver: "Driver",
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
  | "driverapp"
  | "calendar"
  | "compliance"
  | "operations"
  | "currencies";

export const MATRIX: Record<Section, Role[]> = {
  dashboard: ["super_admin", "ops_manager", "dispatcher", "fleet_manager", "finance_officer"],
  companies: ["super_admin", "ops_manager"],
  employees: ["super_admin", "ops_manager"],
  fleet: ["super_admin", "fleet_manager", "ops_manager"],
  drivers: ["super_admin", "fleet_manager", "ops_manager", "finance_officer"],
  routes: ["super_admin", "ops_manager", "dispatcher"],
  trips: ["super_admin", "ops_manager", "dispatcher"],
  dispatch: ["super_admin", "ops_manager", "dispatcher"],
  bookings: ["super_admin", "ops_manager", "dispatcher"],
  finance: ["super_admin", "finance_officer"],
  reports: ["super_admin", "ops_manager", "finance_officer"],
  incidents: ["super_admin", "ops_manager", "dispatcher", "fleet_manager"],
  audit: ["super_admin"],
  settings: ["super_admin", "ops_manager", "dispatcher", "fleet_manager", "finance_officer", "driver"],
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
  | "finance.manage"
  | "incident.manage"
  | "incident.report"
  | "audit.view"
  | "user.manage"
  | "driver.duty";

export const PERMISSIONS: Record<Permission, Role[]> = {
  "company.manage": ["super_admin", "ops_manager"],
  "employee.manage": ["super_admin", "ops_manager"],
  "vehicle.manage": ["super_admin", "fleet_manager"],
  "driver.manage": ["super_admin", "fleet_manager"],
  "route.manage": ["super_admin", "ops_manager", "dispatcher"],
  "trip.manage": ["super_admin", "ops_manager", "dispatcher"],
  "trip.dispatch": ["super_admin", "ops_manager", "dispatcher"],
  "booking.approve": ["super_admin", "ops_manager", "dispatcher"],
  "finance.manage": ["super_admin", "finance_officer"],
  "incident.manage": ["super_admin", "ops_manager", "dispatcher", "fleet_manager"],
  "incident.report": ["super_admin", "ops_manager", "dispatcher", "fleet_manager", "driver"],
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
  "fleet_manager",
  "finance_officer",
];
