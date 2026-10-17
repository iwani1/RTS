"use server";

/**
 * Provider checks.
 *
 * A gateway is either connected or it is not, and the only honest way to
 * find out is to send something through it. This action sends one message,
 * reports exactly what the provider said, and records the attempt in the
 * notification log. With no address given, the message goes to the operator's
 * own number or inbox.
 */
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import type { ActionState } from "@/components/action-form";
import { PermissionError, withAction } from "@/lib/action-guard";
import { logAudit, requireUser } from "@/lib/auth";
import { can, type Role } from "@/lib/rbac";
import { sendEmail, sendSms } from "@/lib/providers";

const str = (fd: FormData, k: string, max = 500) => {
  const raw = String(fd.get(k) ?? "").trim();
  return raw.length > max ? "" : raw;
};

async function sendTestMessageAction__impl(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (!can(user.role as Role, "user.manage")) {
    throw new PermissionError("You do not have permission to perform this action.");
  }

  const channel = str(fd, "channel") === "email" ? "email" : "sms";
  const [account] = await db
    .select({ phone: users.phone, email: users.email, fullName: users.fullName })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  // The message always goes to the operator's own number or inbox. A check
  // that can send to any address would be a way to spend the company's
  // airtime or to send mail in its name, and the check does not need it.
  const to = channel === "sms" ? account?.phone : account?.email;

  if (!to) {
    return {
      ok: false,
      message: `There is no ${channel === "sms" ? "phone number" : "email address"} on your account.`,
    };
  }

  const body =
    str(fd, "body", 300) ||
    `RTS check: this message was sent to ${account?.fullName ?? to} at ${new Date().toUTCString()}.`;

  const result =
    channel === "sms"
      ? await sendSms(to, body)
      : await sendEmail(to, "RTS test message", body);

  await db.insert(notifications).values({
    userId: user.id,
    channel,
    category: "provider_check",
    title: `Test message to ${to}`,
    body,
    deliveryStatus: result.ok ? "sent" : "failed",
    providerRef: result.ref,
    deliveryError: result.error,
  });

  await logAudit({
    user,
    action: "provider.test_message",
    entity: "notification",
    details: { channel, to, ok: result.ok, provider: result.provider },
  });

  revalidatePath("/settings");

  if (!result.ok) {
    return { ok: false, message: `The message was not sent: ${result.error}` };
  }
  return {
    ok: true,
    message: `${result.provider} accepted the message${
      result.ref ? ` (reference ${result.ref})` : ""
    }.`,
  };
}

/** Wrappers */
export async function sendTestMessageAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  return withAction(sendTestMessageAction__impl)(_p, fd);
}
