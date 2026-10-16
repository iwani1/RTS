import { and, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  drivers,
  employees,
  trips,
  users,
  vehicles,
} from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { companyScope } from "@/lib/auth";
import { NAV_GROUPS, STANDALONE_NAV } from "@/components/shell/nav-config";
import { canAccess, type Role } from "@/lib/rbac";

export const dynamic = "force-dynamic";

type Result = {
  id: string;
  kind: "page" | "trip" | "booking" | "vehicle" | "driver" | "employee";
  label: string;
  context: string;
  href: string;
};

/**
 * ⌘K search. Scoped to what the signed-in user is allowed to see — the
 * tenant boundary applies to search exactly as it does to every other read.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ results: [] });

  const role = user.role as Role;
  const scope = companyScope(user);
  const term = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const results: Result[] = [];

  /* ------------------------------------------------------------- pages */
  const pages = [...NAV_GROUPS.flatMap((g) => g.items), ...STANDALONE_NAV]
    .filter((item) => canAccess(role, item.section))
    .filter((item) => (term ? item.label.toLowerCase().includes(term.toLowerCase()) : true))
    .slice(0, term ? 6 : 8);
  for (const page of pages) {
    results.push({
      id: `page-${page.href}`,
      kind: "page",
      label: page.label,
      context: page.hint ?? "Page",
      href: page.href,
    });
  }

  /* ---------------------------------------------------------- entities */
  if (term.length >= 2) {
    const like = `%${term}%`;

    const tripRows = await db
      .select({
        id: trips.id,
        reference: trips.reference,
        status: trips.status,
        companyId: trips.companyId,
        tripDate: trips.tripDate,
      })
      .from(trips)
      .where(
        and(
          scope ? eq(trips.companyId, scope) : undefined,
          or(ilike(trips.reference, like), ilike(trips.notes, like)),
        ),
      )
      .limit(6);

    for (const row of tripRows) {
      results.push({
        id: `trip-${row.id}`,
        kind: "trip",
        label: row.reference,
        context: `Trip · ${row.status.replace(/_/g, " ")} · ${row.tripDate}`,
        href: `/trips/${row.id}`,
      });
    }

    const bookingRows = await db
      .select({
        id: bookings.id,
        reference: bookings.reference,
        status: bookings.status,
        companyId: bookings.companyId,
        bookingDate: bookings.bookingDate,
      })
      .from(bookings)
      .where(
        and(
          scope ? eq(bookings.companyId, scope) : undefined,
          ilike(bookings.reference, like),
        ),
      )
      .limit(5);

    for (const row of bookingRows) {
      results.push({
        id: `booking-${row.id}`,
        kind: "booking",
        label: row.reference,
        context: `Booking · ${row.status.replace(/_/g, " ")} · ${row.bookingDate}`,
        href: "/bookings",
      });
    }

    const vehicleRows = await db
      .select({
        id: vehicles.id,
        registrationNo: vehicles.registrationNo,
        make: vehicles.make,
        model: vehicles.model,
        status: vehicles.status,
      })
      .from(vehicles)
      .where(
        or(
          ilike(vehicles.registrationNo, like),
          ilike(vehicles.make, like),
          ilike(vehicles.model, like),
        ),
      )
      .limit(5);

    for (const row of vehicleRows) {
      results.push({
        id: `vehicle-${row.id}`,
        kind: "vehicle",
        label: row.registrationNo,
        context: `${row.make} ${row.model} · ${row.status.replace(/_/g, " ")}`,
        href: "/fleet",
      });
    }

    const driverRows = await db
      .select({
        id: drivers.id,
        fullName: drivers.fullName,
        licenseNo: drivers.licenseNo,
        status: drivers.status,
        companyId: drivers.companyId,
      })
      .from(drivers)
      .where(
        and(
          scope ? eq(drivers.companyId, scope) : undefined,
          or(ilike(drivers.fullName, like), ilike(drivers.licenseNo, like)),
        ),
      )
      .limit(5);

    for (const row of driverRows) {
      results.push({
        id: `driver-${row.id}`,
        kind: "driver",
        label: row.fullName,
        context: `Driver · ${row.licenseNo} · ${row.status.replace(/_/g, " ")}`,
        href: "/drivers",
      });
    }

    const employeeRows = await db
      .select({
        id: employees.id,
        fullName: employees.fullName,
        employeeCode: employees.employeeCode,
        companyId: employees.companyId,
        department: employees.department,
      })
      .from(employees)
      .where(
        and(
          scope ? eq(employees.companyId, scope) : undefined,
          or(
            ilike(employees.fullName, like),
            ilike(employees.employeeCode, like),
            ilike(employees.email, like),
          ),
        ),
      )
      .limit(5);

    for (const row of employeeRows) {
      results.push({
        id: `employee-${row.id}`,
        kind: "employee",
        label: row.fullName,
        context: `${row.employeeCode}${row.department ? ` · ${row.department}` : ""}`,
        href: "/employees",
      });
    }
  }

  return Response.json({ results: results.slice(0, 24) });
}
