/**
 * Invoice construction.
 *
 * Both the finance screen and the scheduled invoicing job build invoices here,
 * so a bill raised on the 1st of the month is built by exactly the same rules
 * as one an operator raises by hand.
 */
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  companies,
  invoiceLines,
  invoices,
  serviceAgreements,
  trips,
} from "@/db/schema";
import { round2 } from "@/lib/domain";

export type InvoiceLine = {
  description: string;
  category: string;
  quantity: string;
  unitPrice: string;
  amount: number;
};

export type InvoiceDraft = {
  companyId: number;
  companyName: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  lines: InvoiceLine[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
};

export type BuildInvoiceOptions = {
  companyId: number;
  periodStart: string;
  periodEnd: string;
  /** Tax rate as a fraction. Defaults to 15%, the Ghanaian VAT standard rate. */
  taxRate?: number;
};

/**
 * Build the invoice draft for a company and period. Nothing is written — the
 * caller decides whether to persist it.
 */
export async function buildInvoiceDraft(
  options: BuildInvoiceOptions,
): Promise<InvoiceDraft | null> {
  const { companyId, periodStart, periodEnd } = options;
  const taxRate = options.taxRate ?? 0.15;

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!company) return null;

  const [agreement] = await db
    .select()
    .from(serviceAgreements)
    .where(eq(serviceAgreements.companyId, companyId))
    .orderBy(desc(serviceAgreements.id))
    .limit(1);

  const completedTrips = await db
    .select({
      bookedSeats: trips.bookedSeats,
      plannedKm: trips.plannedKm,
      waitingMinutes: trips.waitingMinutes,
      overtimeMinutes: trips.overtimeMinutes,
      direction: trips.direction,
    })
    .from(trips)
    .where(
      and(
        eq(trips.companyId, companyId),
        eq(trips.status, "completed"),
        gte(trips.tripDate, periodStart),
        lte(trips.tripDate, periodEnd),
      ),
    );

  const tripCount = completedTrips.length;
  const passengers = completedTrips.reduce(
    (sum: number, t) => sum + Number(t.bookedSeats ?? 0),
    0,
  );
  const km = completedTrips.reduce(
    (sum: number, t) => sum + Number(t.plannedKm ?? 0),
    0,
  );
  const waitingMinutes = completedTrips.reduce(
    (sum: number, t) => sum + Number(t.waitingMinutes ?? 0),
    0,
  );
  const overtimeMinutes = completedTrips.reduce(
    (sum: number, t) => sum + Number(t.overtimeMinutes ?? 0),
    0,
  );

  const model = agreement?.pricingModel ?? company.billingModel;
  const rate = Number(agreement?.unitRate ?? 0);
  const lines: InvoiceLine[] = [];

  if (model === "per_passenger") {
    lines.push({
      description: "Staff shuttle transport — passengers carried",
      category: "transport",
      quantity: String(passengers),
      unitPrice: String(rate),
      amount: round2(passengers * rate),
    });
  } else if (model === "per_trip") {
    lines.push({
      description: "Staff shuttle transport — completed trips",
      category: "transport",
      quantity: String(tripCount),
      unitPrice: String(rate),
      amount: round2(tripCount * rate),
    });
  } else if (model === "distance_based") {
    lines.push({
      description: "Staff shuttle transport — distance operated",
      category: "transport",
      quantity: String(km),
      unitPrice: String(rate),
      amount: round2(km * rate),
    });
  } else {
    lines.push({
      description: "Monthly transportation retainer",
      category: "retainer",
      quantity: "1",
      unitPrice: String(Number(agreement?.fixedMonthlyAmount ?? company.monthlyRate)),
      amount: Number(agreement?.fixedMonthlyAmount ?? company.monthlyRate),
    });
  }

  const adHoc = completedTrips.filter((t) => t.direction === "ad_hoc").length;
  const extraTripCharge = Number(agreement?.extraTripCharge ?? 250);
  if (adHoc > 0) {
    lines.push({
      description: `Ad-hoc / emergency transport (${adHoc} trips)`,
      category: "extra",
      quantity: String(adHoc),
      unitPrice: extraTripCharge.toFixed(2),
      amount: round2(adHoc * extraTripCharge),
    });
  }

  const waitingRate = Number(agreement?.waitingChargePerHour ?? 0);
  if (waitingMinutes > 0 && waitingRate > 0) {
    const hours = waitingMinutes / 60;
    lines.push({
      description: `Waiting time (${waitingMinutes} min)`,
      category: "waiting",
      quantity: hours.toFixed(2),
      unitPrice: waitingRate.toFixed(2),
      amount: round2(hours * waitingRate),
    });
  }

  const overtimeRate = Number(agreement?.overtimeChargePerHour ?? 0);
  if (overtimeMinutes > 0 && overtimeRate > 0) {
    const hours = overtimeMinutes / 60;
    lines.push({
      description: `Overtime beyond schedule (${overtimeMinutes} min)`,
      category: "overtime",
      quantity: hours.toFixed(2),
      unitPrice: overtimeRate.toFixed(2),
      amount: round2(hours * overtimeRate),
    });
  }

  const subtotal = round2(lines.reduce((sum, line) => sum + line.amount, 0));
  const tax = round2(subtotal * taxRate);

  return {
    companyId,
    companyName: company.name,
    periodStart,
    periodEnd,
    currency: agreement?.currency ?? company.currency ?? "GHS",
    lines,
    subtotal,
    tax,
    discount: 0,
    total: round2(subtotal + tax),
  };
}

/** Persist a draft as an invoice, with its lines. */
export async function persistInvoice(
  draft: InvoiceDraft,
  options: { status?: "draft" | "issued"; dueDays?: number; notes?: string } = {},
): Promise<{ id: number; invoiceNo: string }> {
  const [countRow] = await db
    .select({ v: sql<number>`count(*)` })
    .from(invoices);
  const invoiceNo = `INV-${new Date().getFullYear()}-${String(
    Number(countRow?.v ?? 0) + 1,
  ).padStart(4, "0")}`;

  const [invoice] = await db
    .insert(invoices)
    .values({
      companyId: draft.companyId,
      invoiceNo,
      periodStart: draft.periodStart,
      periodEnd: draft.periodEnd,
      subtotal: String(draft.subtotal),
      tax: String(draft.tax),
      discount: String(draft.discount),
      total: String(draft.total),
      currency: draft.currency,
      status: options.status ?? "issued",
      issuedAt: new Date(),
      dueDate: new Date(
        Date.now() + (options.dueDays ?? 30) * 24 * 60 * 60 * 1000,
      )
        .toISOString()
        .slice(0, 10),
      notes: options.notes ?? null,
    })
    .returning({ id: invoices.id, invoiceNo: invoices.invoiceNo });

  if (draft.lines.length) {
    await db.insert(invoiceLines).values(
      draft.lines.map((line) => ({
        invoiceId: invoice.id,
        description: line.description,
        category: line.category,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        amount: String(line.amount),
      })),
    );
  }

  return { id: invoice.id, invoiceNo: invoice.invoiceNo };
}

/** Has an invoice already been raised for this company and period? */
export async function invoiceExists(
  companyId: number,
  periodStart: string,
  periodEnd: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        eq(invoices.companyId, companyId),
        eq(invoices.periodStart, periodStart),
        eq(invoices.periodEnd, periodEnd),
      ),
    )
    .limit(1);
  return Boolean(row);
}
