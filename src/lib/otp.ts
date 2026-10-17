/**
 * One-time codes for phone sign-in, recovery and boarding verification.
 *
 * A code is stored as a hash with an expiry and an attempt counter. The
 * plaintext is never written to the database, and a code is single-use: it is
 * marked consumed the moment it verifies.
 */
import { and, eq, isNull, gt } from "drizzle-orm";
import { db } from "@/db";
import { otpCodes, users } from "@/db/schema";
import { sendEmail, sendSms } from "@/lib/providers";

/** The values the `otp_channel` and `otp_purpose` enums accept. */
export type OtpChannel = "sms" | "email";
export type OtpPurpose = "login" | "password_reset" | "two_factor" | "boarding";
import { generateOtpCode, hashOtpCode } from "@/lib/totp";
import { log } from "@/lib/observability";

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

export type IssueOtpOptions = {
  userId: number;
  channel?: OtpChannel;
  purpose?: OtpPurpose;
  /** Overrides the generated code. Used by the demo delivery path. */
  code?: string;
  /** Set to false to issue the code without sending it anywhere. */
  deliver?: boolean;
};

export type IssuedOtp = {
  id: number;
  /** The plaintext code. Only returned so it can be delivered or shown. */
  code: string;
  expiresAt: Date;
  /** Whether an external provider carried the message. */
  deliveredExternally: boolean;
  /** Why the message did not leave, when it did not. */
  deliveryError: string | null;
};

/**
 * Issue a one-time code.
 *
 * Any earlier unused code for the same purpose is invalidated first, so only
 * the newest code can be redeemed.
 */
export async function issueOtp(options: IssueOtpOptions): Promise<IssuedOtp | null> {
  const channel = options.channel ?? "sms";
  const purpose = options.purpose ?? "login";
  const code = options.code ?? generateOtpCode();

  await db
    .update(otpCodes)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(otpCodes.userId, options.userId),
        eq(otpCodes.purpose, purpose),
        isNull(otpCodes.consumedAt),
      ),
    );

  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);
  const [row] = await db
    .insert(otpCodes)
    .values({
      userId: options.userId,
      channel,
      purpose,
      codeHash: hashOtpCode(code),
      expiresAt,
    })
    .returning({ id: otpCodes.id });

  const delivery = await deliverCode(options.userId, channel, purpose, code);

  if (!delivery.ok) {
    log("info", "otp.issued.in_app_only", {
      userId: options.userId,
      purpose,
      channel,
      reason: delivery.error,
    });
  }

  return {
    id: row.id,
    code,
    expiresAt,
    deliveredExternally: delivery.ok,
    deliveryError: delivery.error,
  };
}

/**
 * Send the code through the provider that is configured.
 *
 * The code is only reported as delivered when the provider confirmed it. If
 * there is no provider, or the provider refused, the caller is told why and
 * the code stays on screen so the person can still sign in.
 */
async function deliverCode(
  userId: number,
  channel: OtpChannel,
  purpose: OtpPurpose,
  code: string,
): Promise<{ ok: boolean; error: string | null }> {
  const [user] = await db
    .select({ phone: users.phone, email: users.email, fullName: users.fullName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return { ok: false, error: "The account could not be found." };

  const label: Record<OtpPurpose, string> = {
    login: "sign-in",
    password_reset: "password reset",
    two_factor: "two-factor",
    boarding: "boarding",
  };

  if (channel === "sms") {
    if (!user.phone) {
      return { ok: false, error: "There is no phone number on the account." };
    }
    const result = await sendSms(
      user.phone,
      `${user.fullName ?? "Hello"}, your ${label[purpose]} code for RTS is ${code}. It expires in ${CODE_TTL_MINUTES} minutes.`,
    );
    return { ok: result.ok, error: result.error };
  }

  if (!user.email) {
    return { ok: false, error: "There is no email address on the account." };
  }
  const result = await sendEmail(
    user.email,
    `Your RTS ${label[purpose]} code`,
    `${user.fullName ?? "Hello"},\n\nYour ${label[purpose]} code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes.\n\nIf you did not ask for this code, you can ignore this message.`,
  );
  return { ok: result.ok, error: result.error };
}

export type VerifyResult = { ok: true } | { ok: false; message: string };

/** Verify and consume a one-time code. */
export async function verifyOtp(
  userId: number,
  purpose: OtpPurpose,
  code: string,
): Promise<VerifyResult> {
  const clean = String(code ?? "").trim();
  if (!clean) return { ok: false, message: "Enter the code we sent you." };

  const [row] = await db
    .select()
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.userId, userId),
        eq(otpCodes.purpose, purpose),
        isNull(otpCodes.consumedAt),
        gt(otpCodes.expiresAt, new Date()),
      ),
    )
    .orderBy(otpCodes.id)
    .limit(1);

  if (!row) {
    return { ok: false, message: "That code has expired. Request a new one." };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, message: "Too many attempts. Request a new code." };
  }

  if (row.codeHash !== hashOtpCode(clean)) {
    await db
      .update(otpCodes)
      .set({ attempts: row.attempts + 1 })
      .where(eq(otpCodes.id, row.id));
    return { ok: false, message: "That code is not correct." };
  }

  await db
    .update(otpCodes)
    .set({ consumedAt: new Date(), attempts: row.attempts + 1 })
    .where(eq(otpCodes.id, row.id));
  return { ok: true };
}
