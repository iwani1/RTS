import type { ReactNode } from "react";
import { and, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, bookings, incidents, notifications, trips } from "@/db/schema";
import { companyScope, requireUser } from "@/lib/auth";
import { canAccess, ROLE_LABELS, type Role, type Section } from "@/lib/rbac";
import { NAV_GROUPS, STANDALONE_NAV } from "./nav-config";
import { Sidebar, type ShellNavGroup, type ShellNavItem } from "./sidebar";
import { TopBar, type TickerEvent } from "./topbar";
import { ThemeProvider } from "./theme-provider";

const TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  dispatch: "Live Dispatch",
  trips: "Trips",
  bookings: "Bookings",
  routes: "Routes & Stops",
  employees: "Employees",
  companies: "Corporate Clients",
  fleet: "Fleet",
  drivers: "Drivers",
  incidents: "Safety & Incidents",
  finance: "Billing & Payroll",
  reports: "Reports",
  audit: "Audit Trail",
  settings: "Settings & Users",
  passenger: "My Transport",
  driver: "Driver App",
  docs: "Documentation",
};

export async function AppShell({
  children,
  section,
}: {
  children: ReactNode;
  section: Section;
}) {
  const user = await requireUser();
  const role = user.role as Role;
  const scope = companyScope(user);

  const badges = await loadBadges(role, scope);
  const unread = await loadUnread(user.id);
  const events = await loadTicker(scope);
  const title = TITLES[section] ?? "Operations";

  const groups: ShellNavGroup[] = NAV_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    items: group.items
      .filter((item) => canAccess(role, item.section))
      .map((item) => ({ ...item, badge: badges[item.section] })),
  })).filter((group) => group.items.length > 0);

  const standalone: ShellNavItem[] = STANDALONE_NAV.filter((item) =>
    canAccess(role, item.section),
  ).map((item) => ({ ...item, badge: badges[item.section] }));

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-canvas text-ink">
        <div className="lg:pl-[var(--rail-w)]">
          <TopBar
            breadcrumb={[{ label: "RTS" }, { label: title }]}
            events={events}
            userName={user.fullName}
            roleLabel={ROLE_LABELS[role]}
            unread={unread}
            signOutAction="/api/auth/logout"
          />
          <main className="mx-auto w-full max-w-[1440px] px-4 py-6 lg:px-6 lg:py-8">
            {children}
          </main>
        </div>
        <Sidebar
          groups={groups}
          standalone={standalone}
          brand="RTS"
          roleLabel={ROLE_LABELS[role]}
          userName={user.fullName}
        />
      </div>
    </ThemeProvider>
  );
}

async function loadBadges(
  role: Role,
  scope: number | null,
): Promise<Partial<Record<Section, number>>> {
  try {
    const result: Partial<Record<Section, number>> = {};
    if (canAccess(role, "bookings")) {
      const [pending] = await db
        .select({ v: count() })
        .from(bookings)
        .where(
          and(
            scope ? eq(bookings.companyId, scope) : undefined,
            inArray(bookings.status, ["pending", "waitlisted"]),
          ),
        );
      result.bookings = Number(pending?.v ?? 0);
    }
    if (canAccess(role, "incidents")) {
      const [open] = await db
        .select({ v: count() })
        .from(incidents)
        .where(eq(incidents.status, "open"));
      result.incidents = Number(open?.v ?? 0);
    }
    if (canAccess(role, "trips")) {
      const [unassigned] = await db
        .select({ v: count() })
        .from(trips)
        .where(
          and(
            scope ? eq(trips.companyId, scope) : undefined,
            inArray(trips.status, ["scheduled", "dispatching"]),
            sql`(${trips.vehicleId} is null or ${trips.driverId} is null)`,
          ),
        );
      result.trips = Number(unassigned?.v ?? 0);
    }
    return result;
  } catch {
    return {};
  }
}

async function loadUnread(userId: number): Promise<number> {
  try {
    const [row] = await db
      .select({ v: count() })
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), isNull(notifications.readAt)),
      );
    return Number(row?.v ?? 0);
  } catch {
    return 0;
  }
}

/**
 * The live ticker. Real events, newest first, drawn from the audit trail,
 * the notification queue and the trip board.
 */
async function loadTicker(scope: number | null): Promise<TickerEvent[]> {
  const events: TickerEvent[] = [];
  try {
    const live = await db
      .select({
        reference: trips.reference,
        status: trips.status,
        companyId: trips.companyId,
        scheduledDeparture: trips.scheduledDeparture,
      })
      .from(trips)
      .where(
        and(
          scope ? eq(trips.companyId, scope) : undefined,
          inArray(trips.status, ["in_progress", "dispatching", "delayed", "breakdown"]),
        ),
      )
      .orderBy(desc(trips.scheduledDeparture))
      .limit(6);

    for (const trip of live) {
      events.push({
        at: new Date(trip.scheduledDeparture).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        text: `${trip.reference} · ${trip.status.replace(/_/g, " ")}`,
        tone:
          trip.status === "breakdown"
            ? "critical"
            : trip.status === "delayed"
              ? "caution"
              : trip.status === "in_progress"
                ? "live"
                : "idle",
      });
    }

    const recentAudit = await db
      .select({
        action: auditLogs.action,
        entity: auditLogs.entity,
        createdAt: auditLogs.createdAt,
        companyId: auditLogs.companyId,
      })
      .from(auditLogs)
      .where(scope ? eq(auditLogs.companyId, scope) : undefined)
      .orderBy(desc(auditLogs.createdAt))
      .limit(6);

    for (const entry of recentAudit) {
      events.push({
        at: new Date(entry.createdAt).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        text: `${entry.action.replace(/[._]/g, " ")} · ${entry.entity}`,
        tone: "idle",
      });
    }
  } catch {
    /* the ticker is decorative — never block the shell on it */
  }
  return events;
}
