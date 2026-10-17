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
 *  - a claim that is stranded by a crash is recovered, so a message is never
 *    lost without trace;
 *  - a failed delivery is tried again, and only given up on after three
 *    attempts, with the reason kept on the row;
 *  - the delivery status is the truth: `sent`, `failed`, or `in_app_only`
 *    when there is no provider behind the channel.
 */
import { and, eq, inArray, lt } from "drizzle-orm";
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
  attempt: number;
};

export type DeliveryOutcome = {
  claimed: number;
  sent: number;
  failed: number;
  /** Rows put back in the queue for another attempt. */
  retrying: number;
  /** Rows recovered from a claim that was stranded by a crash. */
  recovered: number;
  details: DeliveryDetail[];
};

/** The channels that can leave the building. */
const EXTERNAL_CHANNELS = ["sms", "email"] as const;

/** How many times a message is handed to a provider before it is given up on. */
const MAX_ATTEMPTS = 3;

/** A claim older than this is treated as a crash and the row is re-queued. */
const STALE_CLAIM_MINUTES = 10;

/**
 * Deliver every queued message.
 *
 * The limit keeps one tick short; a large backlog is worked through over
 * several ticks so a slow provider cannot hold the job runner.
 */
export async function deliverPending(limit = 50): Promise<DeliveryOutcome> {
  const details: DeliveryDetail[] = [];
  const recovered = await recoverStaleClaims();

  const pending = await db
    .select({
      id: notifications.id,
      channel: notifications.channel,
      title: notifications.title,
      body: notifications.body,
      userId: notifications.userId,
      attempts: notifications.deliveryAttempts,
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
    return { claimed: 0, sent: 0, failed: 0, retrying: 0, recovered, details };
  }

  // Claim the rows first. A row that is already `sending` belongs to another
  // worker, so this update returns only the rows this worker owns.
  const claimed = await db
    .update(notifications)
    .set({ deliveryStatus: "sending", updatedAt: new Date() })
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
  const recipients = await recipientsFor(pending.map((row) => row.userId));

  let sent = 0;
  let failed = 0;
  let retrying = 0;

  for (const row of pending) {
    if (!claimedIds.has(row.id)) continue;

    const recipient = recipients.get(row.userId ?? 0) ?? { phone: null, email: null };
    const attempt = row.attempts + 1;
    const outcome = await deliverOne(row.channel, recipient, row.title, row.body);
    details.push({
      id: row.id,
      channel: row.channel,
      ok: outcome.ok,
      ref: outcome.ref,
      error: outcome.error,
      attempt,
    });

    if (outcome.ok) {
      sent += 1;
      await db
        .update(notifications)
        .set({
          deliveryStatus: "sent",
          providerRef: outcome.ref,
          deliveryError: null,
          deliveryAttempts: attempt,
          updatedAt: new Date(),
        })
        .where(eq(notifications.id, row.id));
      continue;
    }

    // A failure is recorded either way. While there are attempts left the
    // row goes back in the queue, so a provider that was briefly down does
    // not cost the message.
    const giveUp = attempt >= MAX_ATTEMPTS;
    if (giveUp) failed += 1;
    else retrying += 1;

    await db
      .update(notifications)
      .set({
        deliveryStatus: giveUp ? "failed" : "queued",
        providerRef: outcome.ref,
        deliveryError: outcome.error,
        deliveryAttempts: attempt,
        updatedAt: new Date(),
      })
      .where(eq(notifications.id, row.id));
  }

  if (details.length > 0) {
    log("info", "notifications.delivered", {
      sent,
      failed,
      retrying,
      channels: [...new Set(details.map((d) => d.channel))],
    });
  }

  return { claimed: claimedIds.size, sent, failed, retrying, recovered, details };
}

/**
 * Put a stranded claim back in the queue.
 *
 * A worker that dies between the claim and the write-back leaves the row
 * marked `sending` for ever, and nothing would ever pick it up again. A
 * claim older than ten minutes is therefore treated as a crash.
 */
async function recoverStaleClaims(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_CLAIM_MINUTES * 60 * 1000);
  const recovered = await db
    .update(notifications)
    .set({ deliveryStatus: "queued", updatedAt: new Date() })
    .where(
      and(
        eq(notifications.deliveryStatus, "sending"),
        lt(notifications.updatedAt, cutoff),
      ),
    )
    .returning({ id: notifications.id });

  if (recovered.length > 0) {
    log("warn", "notifications.claims_recovered", { count: recovered.length });
  }
  return recovered.length;
}

type Recipient = { phone: string | null; email: string | null };

/** One lookup for the whole batch, rather than one per message. */
async function recipientsFor(
  userIds: Array<number | null>,
): Promise<Map<number, Recipient>> {
  const ids = [...new Set(userIds.filter((id): id is number => typeof id === "number"))];
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: users.id, phone: users.phone, email: users.email })
    .from(users)
    .where(inArray(users.id, ids));
  return new Map(rows.map((row) => [row.id, { phone: row.phone, email: row.email }]));
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
