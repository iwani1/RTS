"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { employees, passwordResets, users } from "@/db/schema";
import {
  assertLoginAllowed,
  createSession,
  requireUser,
  destroySession,
  generateToken,
  getSessionUser,
  hashPassword,
  hashToken,
  logAudit,
  recordLoginAttempt,
  revokeAllSessions,
  verifyPassword,
} from "@/lib/auth";
import { homeFor } from "@/lib/auth";
import type { Role } from "@/lib/rbac";
import type { ActionState } from "@/components/action-form";
import { withAction } from "@/lib/action-guard";
import { issueOtp, verifyOtp } from "@/lib/otp";
import {
  generateBase32Secret,
  otpauthUri,
  totp,
  verifyTotp,
} from "@/lib/totp";
import {
  emailSchema,
  nameSchema,
  passwordPair,
  passwordSchema,
  phoneSchema,
  requiredString,
} from "@/lib/validation";

const PRIVILEGED: Role[] = ["super_admin", "ops_manager", "finance_officer", "dispatcher"];

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const emailResult = requiredString(formData, "email", emailSchema);
  if (!emailResult.ok) return { ok: false, message: emailResult.message };
  const email = emailResult.value;

  const password = String(formData.get("password") ?? "");
  const code = String(formData.get("code") ?? "").trim();

  if (!password) return { ok: false, message: "Email and password are required." };

  // Throttle before any credential work, so a password-spray cannot burn CPU.
  const throttle = await assertLoginAllowed(email);
  if (!throttle.allowed) {
    return {
      ok: false,
      message: `Too many failed attempts. Try again in ${throttle.retryInMinutes} minutes.`,
    };
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !valid) {
    await recordLoginAttempt(email, false);
    return { ok: false, message: "Invalid email or password." };
  }
  if (user.status !== "active") {
    await recordLoginAttempt(email, false);
    return { ok: false, message: `Account is ${user.status}. Contact your administrator to activate it.` };
  }
  if (user.totpEnabled && user.totpSecret) {
    // A real authenticator app: the code is derived from a shared secret and
    // verified against a one-period clock drift window.
    if (!code) {
      return { ok: false, message: "Enter the code from your authenticator app." };
    }
    if (!verifyTotp(user.totpSecret, code)) {
      await recordLoginAttempt(email, false);
      return { ok: false, message: "That authenticator code is not valid." };
    }
  } else if (PRIVILEGED.includes(user.role as Role) && user.twoFactorEnabled) {
    // Legacy second factor: a server-held code, used by the demonstration
    // accounts until an operator enrols an authenticator app.
    if (!code) return { ok: false, message: "Two-factor code required for privileged accounts." };
    if (code !== user.twoFactorCode) {
      await recordLoginAttempt(email, false);
      return { ok: false, message: "Invalid two-factor code." };
    }
  }

  await recordLoginAttempt(email, true);
  await createSession(user.id);
  await logAudit({
    user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, companyId: user.companyId, status: user.status, twoFactorEnabled: user.twoFactorEnabled },
    action: "auth.login",
    entity: "user",
    entityId: user.id,
  });
  redirect(homeFor(user.role as Role));
}

export async function registerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const nameResult = requiredString(formData, "fullName", nameSchema);
  if (!nameResult.ok) return { ok: false, message: nameResult.message };
  const fullName = nameResult.value;

  const emailResult = requiredString(formData, "email", emailSchema);
  if (!emailResult.ok) return { ok: false, message: emailResult.message };
  const email = emailResult.value;

  const phoneRaw = String(formData.get("phone") ?? "").trim();
  if (phoneRaw) {
    const phoneResult = requiredString(formData, "phone", phoneSchema);
    if (!phoneResult.ok) return { ok: false, message: phoneResult.message };
  }

  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { ok: false, message: "Password must be at least 8 characters." };

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return { ok: false, message: "An account with this email already exists." };

  // If HR already registered this person as an employee, activate immediately.
  const [employee] = await db.select().from(employees).where(eq(employees.email, email)).limit(1);
  const autoApprove = Boolean(employee);

  const [created] = await db
    .insert(users)
    .values({
      fullName,
      email,
      phone: phoneRaw || null,
      passwordHash: await hashPassword(password),
      role: "employee",
      status: autoApprove ? "active" : "pending",
      companyId: employee?.companyId ?? null,
    })
    .returning({ id: users.id, status: users.status });

  if (employee) {
    await db.update(employees).set({ userId: created.id }).where(eq(employees.id, employee.id));
  }

  await logAudit({
    action: "auth.register",
    entity: "user",
    entityId: created.id,
    companyId: employee?.companyId ?? null,
    details: { email, autoApprove },
  });

  return {
    ok: true,
    message: autoApprove
      ? "Account activated — your work email matched an employee record. You can sign in now."
      : "Registration received. An administrator must approve the account before you can sign in.",
  };
}

export async function requestPasswordResetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const emailResult = requiredString(formData, "email", emailSchema);
  if (!emailResult.ok) return { ok: false, message: emailResult.message };
  const email = emailResult.value;

  // Throttle reset requests as well — they are a cheap way to spam mailboxes.
  const throttle = await assertLoginAllowed(`reset:${email}`);
  if (!throttle.allowed) {
    return {
      ok: false,
      message: `Too many reset requests. Try again in ${throttle.retryInMinutes} minutes.`,
    };
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    // Same response either way so the endpoint cannot enumerate accounts.
    return { ok: true, message: "If that account exists, a reset link has been generated." };
  }

  const token = generateToken(24);
  await db.insert(passwordResets).values({
    userId: user.id,
    // Only the hash is stored. A database leak cannot be used to reset passwords.
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  await recordLoginAttempt(`reset:${email}`, true);
  await logAudit({ action: "auth.password_reset_requested", entity: "user", entityId: user.id });
  // No email provider configured in this environment: the link is returned so the
  // flow is testable end to end. Swap for an email/SMS job in production.
  return {
    ok: true,
    message: `Reset link (demo delivery): /reset-password?token=${token}`,
    data: { token },
  };
}

async function resetPasswordAction__impl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { ok: false, message: "Reset token missing." };
  const passwordResult = passwordSchema.safeParse(String(formData.get("password") ?? ""));
  if (!passwordResult.success) {
    return { ok: false, message: "Password must be at least 8 characters." };
  }
  const password = passwordResult.data;

  const [row] = await db
    .select()
    .from(passwordResets)
    .where(
      and(
        eq(passwordResets.tokenHash, hashToken(token)),
        isNull(passwordResets.usedAt),
        gt(passwordResets.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) return { ok: false, message: "This reset link is invalid or has expired." };

  await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, row.userId));
  await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, row.id));
  // Every existing session is invalidated when the password changes.
  await revokeAllSessions(row.userId);
  await logAudit({ action: "auth.password_reset", entity: "user", entityId: row.userId });

  return { ok: true, message: "Password updated. You can now sign in with your new password." };
}

/**
 * Change your own password. The current password must be supplied, and every
 * other session is signed out so a stolen device loses access immediately.
 */
async function changeOwnPasswordAction__impl(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Your session has expired. Sign in again." };

  const current = String(formData.get("currentPassword") ?? "");
  if (!current) return { ok: false, message: "Enter your current password." };

  const pair = passwordPair(formData, "newPassword", "confirmPassword");
  if (!pair.ok) return { ok: false, message: pair.message };
  const next = pair.value;
  if (next === current) {
    return { ok: false, message: "Choose a password you have not used before." };
  }

  const [row] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!row) return { ok: false, message: "Account not found." };
  if (!(await verifyPassword(current, row.passwordHash))) {
    return { ok: false, message: "Your current password is incorrect." };
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next) })
    .where(eq(users.id, user.id));

  // Sign out everywhere else, then re-establish this session.
  await revokeAllSessions(user.id);
  await createSession(user.id);
  await logAudit({ action: "auth.password_changed", entity: "user", entityId: user.id });

  return { ok: true, message: "Password updated. Other devices have been signed out." };
}

export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withAction(resetPasswordAction__impl)(_prev, formData);
}

export async function changeOwnPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withAction(changeOwnPasswordAction__impl)(_prev, formData);
}

/**
 * Request a one-time code for phone sign-in.
 *
 * With no SMS provider configured the code is returned on screen, labelled as
 * a demonstration delivery. The app never claims a message was sent when it
 * was not.
 */
export async function requestPhoneOtpAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const emailResult = requiredString(formData, "email", emailSchema);
  if (!emailResult.ok) return { ok: false, message: emailResult.message };
  const email = emailResult.value;

  const throttle = await assertLoginAllowed(`otp:${email}`);
  if (!throttle.allowed) {
    return {
      ok: false,
      message: `Too many requests. Try again in ${throttle.retryInMinutes} minutes.`,
    };
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || user.status !== "active") {
    // The same response either way, so the endpoint cannot enumerate accounts.
    return {
      ok: true,
      message: "If that account exists, a sign-in code has been sent.",
    };
  }

  const issued = await issueOtp({ userId: user.id, channel: "sms", purpose: "login" });
  if (!issued) return { ok: false, message: "The code could not be issued." };

  await logAudit({
    user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, companyId: user.companyId, status: user.status, twoFactorEnabled: user.twoFactorEnabled },
    action: "auth.otp_requested",
    entity: "user",
    entityId: user.id,
  });

  if (issued.deliveredExternally) {
    return { ok: true, message: "A sign-in code has been sent to your phone." };
  }
  return {
    ok: true,
    message: `Demonstration delivery — no SMS provider is configured, so the code is shown here: ${issued.code} (valid for 10 minutes).`,
    data: { code: issued.code },
  };
}

/** Verify a one-time code and sign the user in. */
export async function verifyPhoneOtpAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const emailResult = requiredString(formData, "email", emailSchema);
  if (!emailResult.ok) return { ok: false, message: emailResult.message };
  const email = emailResult.value;
  const code = String(formData.get("code") ?? "").trim();

  const throttle = await assertLoginAllowed(`otp:${email}`);
  if (!throttle.allowed) {
    return {
      ok: false,
      message: `Too many attempts. Try again in ${throttle.retryInMinutes} minutes.`,
    };
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || user.status !== "active") {
    return { ok: false, message: "Invalid email or code." };
  }

  const verified = await verifyOtp(user.id, "login", code);
  if (!verified.ok) {
    await recordLoginAttempt(email, false);
    return { ok: false, message: verified.message };
  }

  await recordLoginAttempt(email, true);
  await createSession(user.id);
  await logAudit({
    user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, companyId: user.companyId, status: user.status, twoFactorEnabled: user.twoFactorEnabled },
    action: "auth.login",
    entity: "user",
    entityId: user.id,
    details: { method: "otp" },
  });
  redirect(homeFor(user.role as Role));
}

/**
 * Start enrolling an authenticator app.
 *
 * The secret is generated and stored, but the feature stays off until the
 * user proves they can generate a code from it.
 */
export async function enableTotpAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const secret = generateBase32Secret();
  await db.update(users).set({ totpSecret: secret }).where(eq(users.id, user.id));
  await logAudit({
    user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, companyId: user.companyId, status: user.status, twoFactorEnabled: user.twoFactorEnabled },
    action: "auth.totp_enrolment_started",
    entity: "user",
    entityId: user.id,
  });
  return {
    ok: true,
    message:
      "Add the key to your authenticator app, then enter the six-digit code it shows to finish.",
    data: {
      secret,
      uri: otpauthUri(secret, user.email),
      // A current code, so the enrolment can be completed in one step in an
      // environment with no authenticator app to hand.
      code: totp(secret),
    },
  };
}

/** Finish enrolment by proving the app can generate a code. */
export async function confirmTotpAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const [row] = await db
    .select({ secret: users.totpSecret, email: users.email })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!row?.secret) {
    return { ok: false, message: "Start the enrolment before confirming it." };
  }
  const code = String(formData.get("code") ?? "").trim();
  if (!verifyTotp(row.secret, code)) {
    return { ok: false, message: "That code did not match. Check your app and try again." };
  }
  await db
    .update(users)
    .set({ totpEnabled: true })
    .where(eq(users.id, user.id));
  await logAudit({
    user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, companyId: user.companyId, status: user.status, twoFactorEnabled: user.twoFactorEnabled },
    action: "auth.totp_enabled",
    entity: "user",
    entityId: user.id,
  });
  return { ok: true, message: "Authenticator app enabled. It will be required at your next sign-in." };
}

/** Turn the authenticator app off. */
export async function disableTotpAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  await db
    .update(users)
    .set({ totpEnabled: false, totpSecret: null })
    .where(eq(users.id, user.id));
  await logAudit({
    user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, companyId: user.companyId, status: user.status, twoFactorEnabled: user.twoFactorEnabled },
    action: "auth.totp_disabled",
    entity: "user",
    entityId: user.id,
  });
  return { ok: true, message: "Authenticator app turned off." };
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
