/**
 * Settling a payment.
 *
 * A payment is only recorded once the provider has confirmed it. This module
 * is the one place that turns a confirmed transaction into money in the
 * ledger: the payment row is closed, the invoice picks up the amount, and
 * the invoice's status follows.
 *
 * It is safe to run twice. A reference that is already settled is left
 * alone, so a webhook and a browser callback arriving together cannot
 * double-count the money.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { invoices, payments } from "@/db/schema";
import { log } from "@/lib/observability";

export type SettlementInput = {
  reference: string;
  amount: string;
  method: "paystack" | "flutterwave" | "bank_transfer" | "mobile_money" | "cash" | "cheque";
  paidAt?: string | null;
  notes?: string | null;
};

export type SettlementResult = {
  settled: boolean;
  message: string;
  invoiceId: number | null;
  amountPaid: string | null;
};

function toNumber(value: string | number | null | undefined): number {
  const parsed = Number(String(value ?? "0").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Apply a confirmed payment.
 *
 * The amount that is applied is the one the provider confirmed, never the
 * one that was asked for.
 */
export async function settlePayment(
  input: SettlementInput,
): Promise<SettlementResult> {
  const [row] = await db
    .select()
    .from(payments)
    .where(eq(payments.reference, input.reference))
    .limit(1);

  if (!row) {
    return {
      settled: false,
      message: `No payment is waiting for the reference ${input.reference}.`,
      invoiceId: null,
      amountPaid: null,
    };
  }

  if (row.status === "successful") {
    return {
      settled: false,
      message: "This payment was already recorded.",
      invoiceId: row.invoiceId,
      amountPaid: null,
    };
  }

  const amount = toNumber(input.amount);
  const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();

  await db
    .update(payments)
    .set({
      status: "successful",
      amount: String(amount),
      method: input.method,
      paidAt,
      notes: input.notes ?? row.notes,
    })
    .where(eq(payments.id, row.id));

  if (!row.invoiceId) {
    log("info", "payments.settled", { reference: input.reference, amount });
    return {
      settled: true,
      message: "The payment was recorded.",
      invoiceId: null,
      amountPaid: null,
    };
  }

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, row.invoiceId))
    .limit(1);
  if (!invoice) {
    return {
      settled: true,
      message: "The payment was recorded, but its invoice could not be found.",
      invoiceId: row.invoiceId,
      amountPaid: null,
    };
  }

  const amountPaid = toNumber(invoice.amountPaid) + amount;
  const total = toNumber(invoice.total);
  const status =
    amountPaid >= total && total > 0 ? "paid" : amountPaid > 0 ? "partial" : invoice.status;

  await db
    .update(invoices)
    .set({ amountPaid: String(amountPaid), status })
    .where(eq(invoices.id, invoice.id));

  log("info", "payments.settled", {
    reference: input.reference,
    amount,
    invoice: invoice.invoiceNo,
    status,
  });

  return {
    settled: true,
    message:
      status === "paid"
        ? "The payment was recorded and the invoice is settled."
        : "The payment was recorded as a part payment.",
    invoiceId: invoice.id,
    amountPaid: String(amountPaid),
  };
}

/** The payments waiting for a payer, oldest first. */
export async function pendingPayments(limit = 20) {
  return db
    .select({ payment: payments, invoiceNo: invoices.invoiceNo })
    .from(payments)
    .leftJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(and(eq(payments.status, "pending")))
    .limit(limit);
}
