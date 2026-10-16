/**
 * One-time codes for phone sign-in, recovery and boarding verification.
 *
 * A code is stored as a hash with an expiry and an attempt counter. The
 * plaintext is never written to the database, and a code is single-use: it is
 * marked consumed the moment it verifies.
 */
import { and, eq, isNull, gt } from "drizzle-orm";
import { db } from "@/db";
import { otpCodes } from "@/db/schema";

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
};

export type IssuedOtp = {
  id: number;
  /** The plaintext code. Only returned so it can be delivered or shown. */
  code: string;
  expiresAt: Date;
  /** Whether an external provider carried the message. */
  deliveredExternally: boolean;
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

  const deliveredExternally =
    channel === "sms"
      ? Boolean(process.env.SMS_PROVIDER_API_KEY)
      : channel === "email"
        ? Boolean(process.env.EMAIL_PROVIDER_API_KEY)
        : false;

  if (!deliveredExternally) {
    log("info", "otp.issued.in_app_only", { userId: options.userId, purpose, channel });
  }

  return { id: row.id, code, expiresAt, deliveredExternally };
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
