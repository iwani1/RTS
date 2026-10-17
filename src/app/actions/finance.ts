"use server";

/**
 * Online collections.
 *
 * A finance officer asks for a payment link, the client pays on the
 * provider's page, and the provider tells the system what happened. Nothing
 * here marks money as received on the strength of a browser redirect — the
 * settlement is done by the provider's own confirmation.
 */
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, invoices, payments } from "@/db/schema";
import type { ActionState } from "@/components/action-form";
import { PermissionError, withAction } from "@/lib/action-guard";
import { logAudit, requireUser } from "@/lib/auth";
import { can, type Role } from "@/lib/rbac";
import { initialisePayment, paymentsConfig } from "@/lib/providers/payments";

const str = (fd: FormData, k: string, max = 500) => {
  const raw = String(fd.get(k) ?? "").trim();
  return raw.length > max ? "" : raw;
};
const num = (fd: FormData, k: string) => {
  const raw = str(fd, k);
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

/** The address the provider returns the payer to. */
function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

async function requestPaymentLinkAction__impl(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (!can(user.role as Role, "finance.manage")) {
    throw new PermissionError("You do not have permission to perform this action.");
  }

  const invoiceId = num(fd, "invoiceId");
  if (!invoiceId) return { ok: false, message: "Choose an invoice to be paid." };

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!invoice) return { ok: false, message: "That invoice does not exist." };
  if (invoice.status === "paid") {
    return { ok: false, message: "That invoice is already settled." };
  }

  const outstanding = Number(invoice.total) - Number(invoice.amountPaid);
  if (!(outstanding > 0)) {
    return { ok: false, message: "That invoice has nothing outstanding." };
  }

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, invoice.companyId))
    .limit(1);

  const email = str(fd, "email", 180) || company?.email || "";
  if (!email.includes("@")) {
    return {
      ok: false,
      message: "The company has no email address on file. Add one before sending a payment link.",
    };
  }

  const config = paymentsConfig();
  if (!config.provider) {
    return {
      ok: false,
      message:
        "No payment provider is configured, so no link can be created. Set PAYSTACK_SECRET_KEY, or record the payment by hand once it arrives.",
    };
  }

  const reference = `RTS-${invoice.invoiceNo}-${randomBytes(3).toString("hex")}`;
  const result = await initialisePayment({
    amount: outstanding.toFixed(2),
    currency: invoice.currency || "GHS",
    email,
    reference,
    description: `Invoice ${invoice.invoiceNo}`,
    callbackUrl: `${appUrl()}/api/payments/${config.provider}/callback`,
    metadata: { invoiceId: invoice.id, invoiceNo: invoice.invoiceNo },
  });

  if (!result.ok || !result.authorizationUrl) {
    return {
      ok: false,
      message: result.error ?? "The payment provider did not accept the request.",
    };
  }

  await db.insert(payments).values({
    companyId: invoice.companyId,
    invoiceId: invoice.id,
    amount: outstanding.toFixed(2),
    method: config.provider,
    reference: result.reference ?? reference,
    status: "pending",
    notes: `Online payment link — ${result.authorizationUrl}`,
    recordedById: user.id,
  });

  await logAudit({
    user,
    action: "payment.link_requested",
    entity: "payment",
    companyId: invoice.companyId,
    details: { invoiceId: invoice.id, amount: outstanding, provider: config.provider },
  });

  revalidatePath("/finance");
  return {
    ok: true,
    message: `A payment link for GHS ${outstanding.toFixed(2)} is ready.`,
    data: { url: result.authorizationUrl, reference: result.reference ?? reference },
  };
}

/** Wrappers */
export async function requestPaymentLinkAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  return withAction(requestPaymentLinkAction__impl)(_p, fd);
}
