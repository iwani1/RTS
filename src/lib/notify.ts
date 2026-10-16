/**
 * Notification fan-out.
 *
 * A notification is a row, not a side effect. It carries the channel it was
 * intended for and a delivery status, so the interface can say honestly what
 * happened. Without an SMS, email or push provider configured the row is
 * still delivered in-app and marked `in_app_only` — the app never pretends a
 * message left the building.
 */
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { inArray } from "drizzle-orm";

export type NotifyChannel = "in_app" | "sms" | "email" | "push";

export type NotifyInput = {
  userIds: number[];
  category?: string;
  title: string;
  body?: string;
  bookingId?: number;
  tripId?: number;
  companyId?: number | null;
  channels?: NotifyChannel[];
};

export type NotifyResult = {
  created: number;
  inAppOnly: number;
  byChannel: Record<string, number>;
};

/**
 * Which external channels actually have a provider behind them.
 * Read from the environment so a deployment can switch them on without a
 * code change; the app is honest when they are off.
 */
export function configuredChannels(): NotifyChannel[] {
  const channels: NotifyChannel[] = ["in_app"];
  if (process.env.SMS_PROVIDER_API_KEY) channels.push("sms");
  if (process.env.EMAIL_PROVIDER_API_KEY) channels.push("email");
  if (process.env.PUSH_PROVIDER_API_KEY) channels.push("push");
  return channels;
}

/**
 * Create a notification for each recipient.
 *
 * Every recipient gets exactly one in-app row. When an external channel is
 * requested but has no provider, the row is still written and its delivery
 * status records that only the in-app copy reached the user.
 */
export async function notify(input: NotifyInput): Promise<NotifyResult> {
  const recipients = [...new Set(input.userIds)].filter((id) => Number.isFinite(id));
  if (recipients.length === 0) {
    return { created: 0, inAppOnly: 0, byChannel: {} };
  }

  const requested: NotifyChannel[] = input.channels?.length
    ? input.channels
    : ["in_app"];
  const available = configuredChannels();
  const byChannel: Record<string, number> = {};
  let inAppOnly = 0;

  const rows: Array<{
    userId: number;
    companyId: number | null;
    channel: string;
    category: string;
    title: string;
    body: string | null;
    bookingId: number | null;
    tripId: number | null;
    deliveryStatus: string;
    providerRef: string | null;
  }> = recipients.flatMap((userId) =>
    requested.map((channel) => {
      byChannel[channel] = (byChannel[channel] ?? 0) + 1;
      const hasProvider = available.includes(channel);
      if (!hasProvider) inAppOnly += 1;
      return {
        userId,
        companyId: input.companyId ?? null,
        channel,
        category: input.category ?? "general",
        title: input.title,
        body: input.body ?? null,
        bookingId: input.bookingId ?? null,
        tripId: input.tripId ?? null,
        deliveryStatus: hasProvider ? "queued" : "in_app_only",
        providerRef: null,
      };
    }),
  );

  // An in-app copy always exists, so a user with no provider still sees it.
  if (!requested.includes("in_app")) {
    for (const userId of recipients) {
      byChannel.in_app = (byChannel.in_app ?? 0) + 1;
      rows.push({
        userId,
        companyId: input.companyId ?? null,
        channel: "in_app",
        category: input.category ?? "general",
        title: input.title,
        body: input.body ?? null,
        bookingId: input.bookingId ?? null,
        tripId: input.tripId ?? null,
        deliveryStatus: "delivered",
        providerRef: null,
      });
    }
  }

  await db.insert(notifications).values(rows);
  return { created: rows.length, inAppOnly, byChannel };
}

/** Notify every active user holding one of the given roles. */
export async function notifyRoles(
  roles: string[],
  input: Omit<NotifyInput, "userIds">,
): Promise<NotifyResult> {
  const { users } = await import("@/db/schema");
  const { eq, and } = await import("drizzle-orm");
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.status, "active"),
        inArray(users.role, roles as never[]),
      ),
    );
  return notify({ ...input, userIds: rows.map((r) => r.id) });
}
