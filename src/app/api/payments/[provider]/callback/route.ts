import { NextResponse } from "next/server";
import { settlePayment } from "@/lib/payments";
import { verifyPayment } from "@/lib/providers/payments";
import { log } from "@/lib/observability";

export const dynamic = "force-dynamic";

/**
 * Where the payer lands after paying.
 *
 * The redirect on its own proves nothing, so the reference is taken from the
 * provider and checked with the provider before any money is recorded. If
 * the provider says the payment succeeded, the invoice is settled; if it
 * says anything else, the payer is told the truth.
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
    url.searchParams.get("tx_ref") ??
    url.searchParams.get("tx_ref");

  const back = (query: string) =>
    NextResponse.redirect(new URL(`/finance?${query}`, request.url), 303);

  if (!reference) {
    return back("payment=unknown");
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
    method: provider === "flutterwave" ? "flutterwave" : "paystack",
    paidAt: verified.paidAt,
    notes: `Confirmed by ${provider}`,
  });

  return back(result.settled ? "payment=paid" : "payment=recorded");
}
