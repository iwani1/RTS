import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { settlePayment } from "@/lib/payments";
import { paymentsConfig, verifyPayment } from "@/lib/providers/payments";
import { log } from "@/lib/observability";

export const dynamic = "force-dynamic";

/**
 * The provider's own confirmation.
 *
 * The webhook is signed with the secret key, so the body is only read after
 * the signature matches. Even then the transaction is verified with the
 * provider, because a signed message still has to be checked against the
 * provider's own record of what was paid.
 *
 * Paystack signs with `x-paystack-signature`; Flutterwave signs with
 * `verif-hash`. Both are the HMAC-SHA512 of the raw body under the secret
 * key, so one check covers the two providers.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  const config = paymentsConfig();

  if (!config.provider || !config.secretKey) {
    return NextResponse.json(
      { error: "No payment provider is configured." },
      { status: 503 },
    );
  }
  if (config.provider !== provider) {
    return NextResponse.json(
      { error: "That provider is not the one configured." },
      { status: 409 },
    );
  }

  const raw = await request.text();
  const signature =
    request.headers.get("x-paystack-signature") ??
    request.headers.get("verif-hash");

  if (!signature) {
    return NextResponse.json({ error: "The webhook was not signed." }, { status: 401 });
  }

  const expected = createHmac("sha512", config.secretKey).update(raw).digest("hex");
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

  const [row] = await db
    .select({ id: payments.id, status: payments.status })
    .from(payments)
    .where(eq(payments.reference, reference))
    .limit(1);

  if (!row) {
    log("warn", "payments.webhook_unknown_reference", { reference, provider });
    return NextResponse.json({ received: true, applied: false });
  }
  if (row.status === "successful") {
    return NextResponse.json({ received: true, applied: false, already: true });
  }

  const verified = await verifyPayment(reference);
  if (!verified.ok || !verified.paid) {
    log("warn", "payments.webhook_unverified", { reference, provider });
    return NextResponse.json({ received: true, applied: false });
  }

  const result = await settlePayment({
    reference,
    amount: verified.amount ?? "0",
    method: config.provider,
    paidAt: verified.paidAt,
    notes: `Confirmed by ${provider} webhook`,
  });

  return NextResponse.json({ received: true, applied: result.settled });
}
