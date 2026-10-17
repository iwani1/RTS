/**
 * The delivery worker.
 *
 * A notification row is a record, not a side effect: `notify()` writes the
 * row and marks it `queued`. This module is the part that actually talks to
 * the outside world — it claims the queued rows, hands each one to the
 * provider that is configured, and writes down what happened.
 *
 * The rules it follows:
 *  - a row is claimed before it is sent, so two workers cannot send it twice;
 *  - the delivery status is the truth: `sent`, `failed`, or `in_app_only`
 *    when there is no provider behind the channel;
 *  - a failure is written with the reason, never swallowed.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import { sendEmail, sendSms, toE164 } from "@/lib/providers";
import { log } from "@/lib/observability";

export type DeliveryDetail = {
  id: number;
  channel: string;
  ok: boolean;
  ref: string | null;
  error: string | null;
};

export type DeliveryOutcome = {
  claimed: number;
  sent: number;
  failed: number;
  details: DeliveryDetail[];
};

/** The channels that can leave the building. */
const EXTERNAL_CHANNELS = ["sms", "email"] as const;

/**
 * Deliver every queued message.
 *
 * The limit keeps one tick short; a large backlog is worked through over
 * several ticks so a slow provider cannot hold the job runner.
 */
export async function deliverPending(limit = 50): Promise<DeliveryOutcome> {
  const details: DeliveryDetail[] = [];

  const pending = await db
    .select({
      id: notifications.id,
      channel: notifications.channel,
      title: notifications.title,
      body: notifications.body,
      userId: notifications.userId,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.deliveryStatus, "queued"),
        inArray(notifications.channel, [...EXTERNAL_CHANNELS]),
      ),
    )
    .limit(limit);

  if (pending.length === 0) {
    return { claimed: 0, sent: 0, failed: 0, details };
  }

  // Claim the rows first. A row that is already `sending` belongs to another
  // worker, so this update returns only the rows this worker owns.
  const claimed = await db
    .update(notifications)
    .set({ deliveryStatus: "sending" })
    .where(
      and(
        eq(notifications.deliveryStatus, "queued"),
        inArray(
          notifications.id,
          pending.map((row) => row.id),
        ),
      ),
    )
    .returning({ id: notifications.id });

  const claimedIds = new Set(claimed.map((row) => row.id));

  let sent = 0;
  let failed = 0;

  for (const row of pending) {
    if (!claimedIds.has(row.id)) continue;

    const recipient = await recipientFor(row.userId);
    const outcome = await deliverOne(row.channel, recipient, row.title, row.body);
    details.push({
      id: row.id,
      channel: row.channel,
      ok: outcome.ok,
      ref: outcome.ref,
      error: outcome.error,
    });

    if (outcome.ok) sent += 1;
    else failed += 1;

    await db
      .update(notifications)
      .set({
        deliveryStatus: outcome.ok ? "sent" : "failed",
        providerRef: outcome.ref,
        deliveryError: outcome.error,
      })
      .where(eq(notifications.id, row.id));
  }

  if (details.length > 0) {
    log("info", "notifications.delivered", {
      sent,
      failed,
      channels: [...new Set(details.map((d) => d.channel))],
    });
  }

  return { claimed: claimedIds.size, sent, failed, details };
}

type Recipient = { phone: string | null; email: string | null };

async function recipientFor(userId: number | null): Promise<Recipient> {
  if (!userId) return { phone: null, email: null };
  const [row] = await db
    .select({ phone: users.phone, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return { phone: row?.phone ?? null, email: row?.email ?? null };
}

async function deliverOne(
  channel: string,
  recipient: Recipient,
  title: string,
  body: string | null,
) {
  const text = (body ?? "").trim();

  if (channel === "sms") {
    const number = toE164(recipient.phone);
    if (!number) {
      return {
        ok: false,
        ref: null,
        error: "The recipient has no usable phone number on file.",
      };
    }
    return sendSms(number, text ? `${title}. ${text}` : title);
  }

  if (channel === "email") {
    const address = (recipient.email ?? "").trim();
    if (!address) {
      return {
        ok: false,
        ref: null,
        error: "The recipient has no email address on file.",
      };
    }
    return sendEmail(address, title, text || title);
  }

  return {
    ok: false,
    ref: null,
    error: `The channel "${channel}" has no provider.`,
  };
}
