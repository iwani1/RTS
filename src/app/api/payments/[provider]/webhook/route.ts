import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { settlePayment } from "@/lib/payments";
import { verifyPayment } from "@/lib/providers/payments";
import { log } from "@/lib/observability";

export const dynamic = "force-dynamic";

/**
 * The provider's own confirmation.
 *
 * The webhook is signed with the secret key, so the body is only read after
 * the signature matches. Even then the transaction is verified with the
 * provider, because a signed message still has to be checked against the
 * provider's own record of what was paid.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  const secret =
    provider === "flutterwave"
      ? process.env.FLUTTERWAVE_SECRET_KEY
      : process.env.PAYSTACK_SECRET_KEY;

  if (!secret) {
    return NextResponse.json(
      { error: "No payment provider is configured." },
      { status: 503 },
    );
  }

  const raw = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!signature) {
    return NextResponse.json({ error: "The webhook was not signed." }, { status: 401 });
  }

  const expected = createHmac("sha512", secret).update(raw).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    log("warn", "payments.webhook_bad_signature", { provider });
    return NextResponse.json({ error: "The webhook signature did not match." }, { status: 401 });
  }

  let event: {
    event?: string;
    data?: { reference?: string; tx_ref?: string; status?: string };
  };
  try {
    event = JSON.parse(raw) as typeof event;
  } catch {
    return NextResponse.json({ error: "The webhook body was not valid JSON." }, { status: 400 });
  }

  const reference = event.data?.reference ?? event.data?.tx_ref;
  const succeeded =
    event.event === "charge.success" || event.data?.status === "successful";
  if (!reference || !succeeded) {
    // Every other event is acknowledged but changes nothing.
    return NextResponse.json({ received: true, applied: false });
  }

  const verified = await verifyPayment(reference);
  if (!verified.ok || !verified.paid) {
    log("warn", "payments.webhook_unverified", { reference, provider });
    return NextResponse.json({ received: true, applied: false });
  }

  const result = await settlePayment({
    reference,
    amount: verified.amount ?? "0",
    method: provider === "flutterwave" ? "flutterwave" : "paystack",
    paidAt: verified.paidAt,
    notes: `Confirmed by ${provider} webhook`,
  });

  return NextResponse.json({ received: true, applied: result.settled });
}
