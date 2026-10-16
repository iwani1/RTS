import type { Section } from "@/lib/rbac";

/**
 * Navigation is grouped, not a flat sixteen-item list. A dispatcher scanning
 * for "Trips" should not have to pass Finance to get there.
 *
 * This module is pure data — icon *keys*, not components — so the server can
 * hand the navigation map to a client component without serialising React
 * elements across the boundary. The icon registry lives in `icons.ts`.
 */
export type IconKey =
  | "dashboard"
  | "gauge"
  | "bus"
  | "calendar"
  | "map"
  | "users"
  | "pin"
  | "truck"
  | "user-cog"
  | "shield"
  | "banknote"
  | "chart"
  | "scroll"
  | "settings"
  | "headset"
  | "clipboard"
  | "file";

export type NavEntry = {
  href: string;
  label: string;
  section: Section;
  icon: IconKey;
  /** Short description used by the command palette. */
  hint?: string;
};

export type NavGroup = {
  id: string;
  label: string;
  items: NavEntry[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "operate",
    label: "Operate",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        section: "dashboard",
        icon: "dashboard",
        hint: "Today's operation at a glance",
      },
      {
        href: "/dispatch",
        label: "Live Dispatch",
        section: "dispatch",
        icon: "gauge",
        hint: "Command centre — live trips, map, assignments",
      },
      {
        href: "/trips",
        label: "Trips",
        section: "trips",
        icon: "bus",
        hint: "Scheduled and completed journeys",
      },
      {
        href: "/bookings",
        label: "Bookings",
        section: "bookings",
        icon: "calendar",
        hint: "Passenger requests and approvals",
      },
    ],
  },
  {
    id: "plan",
    label: "Plan",
    items: [
      {
        href: "/routes",
        label: "Routes & Stops",
        section: "routes",
        icon: "map",
        hint: "Corridors, stops and pickup sequences",
      },
      {
        href: "/employees",
        label: "Employees",
        section: "employees",
        icon: "users",
        hint: "Staff register, shifts, CSV import",
      },
      {
        href: "/companies",
        label: "Corporate Clients",
        section: "companies",
        icon: "pin",
        hint: "Clients, branches, contracts and SLAs",
      },
    ],
  },
  {
    id: "asset",
    label: "Asset",
    items: [
      {
        href: "/fleet",
        label: "Fleet",
        section: "fleet",
        icon: "truck",
        hint: "Vehicles, documents, maintenance",
      },
      {
        href: "/drivers",
        label: "Drivers",
        section: "drivers",
        icon: "user-cog",
        hint: "Driver register, licences, availability",
      },
    ],
  },
  {
    id: "govern",
    label: "Govern",
    items: [
      {
        href: "/incidents",
        label: "Safety & Incidents",
        section: "incidents",
        icon: "shield",
        hint: "Incidents, SOS, breakdowns",
      },
      {
        href: "/finance",
        label: "Billing & Payroll",
        section: "finance",
        icon: "banknote",
        hint: "Invoices, payments, driver earnings",
      },
      {
        href: "/reports",
        label: "Reports",
        section: "reports",
        icon: "chart",
        hint: "Performance analytics and exports",
      },
      {
        href: "/audit",
        label: "Audit Trail",
        section: "audit",
        icon: "scroll",
        hint: "Every recorded change, by whom and when",
      },
    ],
  },
  {
    id: "config",
    label: "Configure",
    items: [
      {
        href: "/settings",
        label: "Settings & Users",
        section: "settings",
        icon: "settings",
        hint: "Profile, invitations, notifications",
      },
    ],
  },
];

/** Surfaces that are not part of the operations console. */
export const STANDALONE_NAV: NavEntry[] = [
  {
    href: "/passenger",
    label: "My Transport",
    section: "passenger",
    icon: "headset",
    hint: "Book a ride and track it",
  },
  {
    href: "/driver",
    label: "Driver App",
    section: "driverapp",
    icon: "clipboard",
    hint: "Today's duty and boarding",
  },
  {
    href: "/docs",
    label: "Documentation",
    section: "dashboard",
    icon: "file",
    hint: "API reference and operating procedures",
  },
];

export const ALL_NAV: NavEntry[] = [
  ...NAV_GROUPS.flatMap((group) => group.items),
  ...STANDALONE_NAV,
];
