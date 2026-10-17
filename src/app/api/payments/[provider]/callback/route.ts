import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { settlePayment } from "@/lib/payments";
import { paymentsConfig, verifyPayment } from "@/lib/providers/payments";
import { log } from "@/lib/observability";

export const dynamic = "force-dynamic";

/**
 * Where the payer lands after paying.
 *
 * The redirect on its own proves nothing, so the reference is taken from the
 * provider and checked with the provider before any money is recorded. If
 * the provider says the payment succeeded, the invoice is settled; if it
 * says anything else, the payer is told the truth.
 *
 * The order matters: the reference is looked up locally first, so an unknown
 * reference never causes an outbound call to the payment provider.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  const url = new URL(request.url);
  const reference =
    url.searchParams.get("reference") ??
    url.searchParams.get("trxref") ??
    url.searchParams.get("tx_ref");

  const back = (query: string) =>
    NextResponse.redirect(new URL(`/finance?${query}`, request.url), 303);

  if (!reference) {
    return back("payment=unknown");
  }

  const config = paymentsConfig();
  if (!config.provider) {
    return back("payment=unconfigured");
  }
  if (config.provider !== provider) {
    // The payment was made with the provider that is configured. A callback
    // for a different provider is refused rather than settled with the wrong
    // method on the row.
    log("warn", "payments.callback_provider_mismatch", {
      reference,
      requested: provider,
      configured: config.provider,
    });
    return back("payment=unknown");
  }

  const [row] = await db
    .select({ id: payments.id, status: payments.status })
    .from(payments)
    .where(eq(payments.reference, reference))
    .limit(1);

  if (!row) {
    // Nothing is waiting for this reference, so the provider is not asked.
    log("warn", "payments.callback_unknown_reference", { reference });
    return back("payment=unknown");
  }

  if (row.status === "successful") {
    return back("payment=recorded");
  }

  const verified = await verifyPayment(reference);
  if (!verified.ok) {
    log("error", "payments.callback_unverified", { reference, provider });
    return back("payment=unconfirmed");
  }

  if (!verified.paid) {
    log("info", "payments.callback_not_paid", { reference, provider });
    return back("payment=notpaid");
  }

  const result = await settlePayment({
    reference,
    amount: verified.amount ?? "0",
    method: config.provider,
    paidAt: verified.paidAt,
    notes: `Confirmed by ${provider}`,
  });

  return back(result.settled ? "payment=paid" : "payment=recorded");
}
