import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  companies,
  drivers,
  employees,
  invoiceLines,
  invoices,
  trips,
  vehicles,
} from "@/db/schema";
import { companyScope, getSessionUser } from "@/lib/auth";
import { canAccess, type Role } from "@/lib/rbac";
import { buildPdf, pdfFileName, type PdfSection } from "@/lib/pdf";
import { formatMoney } from "@/lib/currency";
import { listCurrencies } from "@/lib/currency";

export const dynamic = "force-dynamic";

/**
 * PDF export.
 *
 * The same reports the CSV export produces, rendered server side as a real
 * PDF file. The document is built by `src/lib/pdf.ts` — a small writer with
 * no dependencies — so the app can hand a client a file it can open, print
 * and archive without a browser print dialog.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorised", { status: 401 });
  if (
    !canAccess(user.role as Role, "reports") &&
    !canAccess(user.role as Role, "finance")
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "trips";
  const from = url.searchParams.get("from") ?? "1970-01-01";
  const to = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
  const requested = url.searchParams.get("company");
  const scope =
    companyScope(user) ?? (Number.isFinite(Number(requested)) && requested ? Number(requested) : null);
  const currencies = await listCurrencies();

  let title = "StaffRide report";
  let subtitle = `${from} to ${to}`;
  let sections: PdfSection[] = [];

  if (type === "invoice") {
    if (!canAccess(user.role as Role, "finance")) {
      return new Response("Forbidden", { status: 403 });
    }
    const id = Number(url.searchParams.get("id"));
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    if (!invoice) return new Response("Invoice not found", { status: 404 });
    if (scope && invoice.companyId !== scope) {
      return new Response("Forbidden", { status: 403 });
    }
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, invoice.companyId))
      .limit(1);
    const lines = await db
      .select()
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, invoice.id));

    title = `Invoice ${invoice.invoiceNo}`;
    subtitle = `${company?.name ?? "Client"} · ${invoice.periodStart} to ${invoice.periodEnd}`;
    sections = [
      {
        columns: [
          { label: "Description", width: 4 },
          { label: "Category", width: 1.2 },
          { label: "Qty", width: 0.8, align: "right" },
          { label: "Unit", width: 1, align: "right" },
          { label: "Amount", width: 1.2, align: "right" },
        ],
        rows: lines.map((line) => [
          line.description,
          line.category,
          String(line.quantity),
          formatMoney(Number(line.unitPrice), invoice.currency, currencies),
          formatMoney(Number(line.amount), invoice.currency, currencies),
        ]),
      },
      {
        heading: "Summary",
        columns: [
          { label: "Subtotal", width: 3 },
          { label: "Tax", width: 1, align: "right" },
          { label: "Total", width: 1.2, align: "right" },
        ],
        rows: [
          [
            formatMoney(Number(invoice.subtotal), invoice.currency, currencies),
            formatMoney(Number(invoice.tax), invoice.currency, currencies),
            formatMoney(Number(invoice.total), invoice.currency, currencies),
          ],
        ],
      },
    ];
  } else if (type === "manifest") {
    const tripId = Number(url.searchParams.get("tripId"));
    const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
    if (!trip) return new Response("Trip not found", { status: 404 });
    if (scope && trip.companyId !== scope) {
      return new Response("Forbidden", { status: 403 });
    }
    const rows = await db
      .select({
        reference: bookings.reference,
        passenger: employees.fullName,
        employeeCode: employees.employeeCode,
        department: employees.department,
        status: bookings.status,
        pickup: bookings.pickupAddress,
      })
      .from(bookings)
      .leftJoin(employees, eq(employees.id, bookings.employeeId))
      .where(eq(bookings.tripId, trip.id))
      .orderBy(asc(employees.fullName));

    title = `Passenger manifest — ${trip.reference}`;
    subtitle = `Trip date ${trip.tripDate}`;
    sections = [
      {
        columns: [
          { label: "Booking", width: 1.2 },
          { label: "Passenger", width: 2 },
          { label: "Code", width: 1 },
          { label: "Department", width: 1.4 },
          { label: "Status", width: 1 },
        ],
        rows: rows.map((row) => [
          row.reference,
          row.passenger ?? "—",
          row.employeeCode ?? "—",
          row.department ?? "—",
          row.status,
        ]),
      },
    ];
  } else {
    const filters = [
      gte(trips.tripDate, from),
      lte(trips.tripDate, to),
      scope ? eq(trips.companyId, scope) : undefined,
    ].filter(Boolean);
    const rows = await db
      .select({
        reference: trips.reference,
        date: trips.tripDate,
        status: trips.status,
        direction: trips.direction,
        company: companies.name,
        vehicle: vehicles.registrationNo,
        driver: drivers.fullName,
        booked: trips.bookedSeats,
        capacity: trips.capacity,
        km: trips.plannedKm,
      })
      .from(trips)
      .leftJoin(companies, eq(companies.id, trips.companyId))
      .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
      .leftJoin(drivers, eq(drivers.id, trips.driverId))
      .where(and(...filters))
      .orderBy(asc(trips.tripDate), asc(trips.scheduledDeparture))
      .limit(500);

    title = "Trip register";
    sections = [
      {
        columns: [
          { label: "Reference", width: 1.1 },
          { label: "Date", width: 1 },
          { label: "Client", width: 1.8 },
          { label: "Vehicle", width: 1.1 },
          { label: "Driver", width: 1.6 },
          { label: "Seats", width: 0.7, align: "right" },
          { label: "Status", width: 1 },
        ],
        rows: rows.map((row) => [
          row.reference,
          String(row.date).slice(0, 10),
          row.company ?? "—",
          row.vehicle ?? "—",
          row.driver ?? "—",
          `${row.booked ?? 0}/${row.capacity ?? 0}`,
          row.status,
        ]),
        note:
          rows.length >= 500
            ? "Showing the first 500 trips. Narrow the date range for the full register."
            : undefined,
      },
    ];
  }

  const pdf = buildPdf({
    title,
    subtitle,
    meta: [
      ["Generated", new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC"],
      ["Generated by", user.fullName],
      ["Report", type],
      ["Scope", scope ? `Client ${scope}` : "All clients"],
    ],
    sections,
    footer: "StaffRide — Staff Transportation Management",
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${pdfFileName(title)}"`,
      "cache-control": "no-store",
    },
  });
}
