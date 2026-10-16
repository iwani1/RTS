import {
  createHash,
  randomBytes,
  randomInt,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, count, desc, eq, gt, gte } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLogs,
  loginAttempts,
  sessions,
  users,
  type User,
} from "@/db/schema";
import { can, canAccess, type Permission, type Role, type Section } from "./rbac";

export const SESSION_COOKIE = "tms_session";
const SESSION_DAYS = 7;

/* ----------------------------------------------------------- passwords */

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * Hash a password with scrypt.
 *
 * The derivation is asynchronous on purpose: a synchronous scrypt blocks the
 * Node event loop for the whole server, which turns a burst of login attempts
 * into a denial of service.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3) return false;
  const [, salt, hash] = parts;
  let derived: Buffer;
  try {
    derived = await scryptAsync(password, Buffer.from(salt, "hex"), 64);
  } catch {
    return false;
  }
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}

export function generateOtp(): string {
  return String(randomInt(100000, 999999));
}

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

/**
 * Hash a bearer token for storage. Tokens are 32+ bytes of entropy, so a
 * plain SHA-256 is sufficient — there is nothing to brute force.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/* ------------------------------------------------------------ sessions */

export async function createSession(userId: number) {
  const token = generateToken(48);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const hdrs = await headers();
  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt,
    ip: hdrs.get("x-forwarded-for") ?? "local",
    userAgent: hdrs.get("user-agent") ?? "unknown",
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
  });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  jar.delete(SESSION_COOKIE);
}

/** Revoke every active session for a user. Used on password reset and by admins. */
export async function revokeAllSessions(userId: number) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export type SessionUser = Pick<
  User,
  "id" | "email" | "fullName" | "role" | "companyId" | "status" | "twoFactorEnabled"
>;

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      companyId: users.companyId,
      status: users.status,
      twoFactorEnabled: users.twoFactorEnabled,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  const user = rows[0];
  if (!user || user.status !== "active") return null;
  return user;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireSection(section: Section): Promise<SessionUser> {
  const user = await requireUser();
  if (!canAccess(user.role as Role, section)) redirect(homeFor(user.role as Role));
  return user;
}

export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role as Role, permission)) {
    throw new Error("You do not have permission to perform this action.");
  }
  return user;
}

export function homeFor(role: Role): string {
  if (role === "driver") return "/driver";
  if (role === "employee") return "/passenger";
  return "/dashboard";
}

/* --------------------------------------------------- login throttling */

const MAX_FAILURES = 5;
const LOCK_WINDOW_MINUTES = 15;

/**
 * Rate limits authentication attempts per identifier.
 *
 * `login_attempts` is the durable record; the check counts failures inside the
 * window. A successful attempt clears the counter.
 */
export async function assertLoginAllowed(identifier: string): Promise<{
  allowed: boolean;
  retryInMinutes: number;
}> {
  const since = new Date(Date.now() - LOCK_WINDOW_MINUTES * 60 * 1000);
  const [row] = await db
    .select({ v: count() })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.identifier, identifier),
        eq(loginAttempts.succeeded, false),
        gte(loginAttempts.createdAt, since),
      ),
    );
  const failures = Number(row?.v ?? 0);
  if (failures < MAX_FAILURES) return { allowed: true, retryInMinutes: 0 };
  return { allowed: false, retryInMinutes: LOCK_WINDOW_MINUTES };
}

export async function recordLoginAttempt(
  identifier: string,
  succeeded: boolean,
  ip?: string | null,
) {
  try {
    await db.insert(loginAttempts).values({
      identifier,
      succeeded,
      ip: ip ?? null,
    });
  } catch {
    // throttling telemetry must never break a login
  }
}

/** The most recent failure for an identifier, used to compute the lock window. */
export async function lastFailureAt(identifier: string): Promise<Date | null> {
  const [row] = await db
    .select({ at: loginAttempts.createdAt })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.identifier, identifier),
        eq(loginAttempts.succeeded, false),
      ),
    )
    .orderBy(desc(loginAttempts.createdAt))
    .limit(1);
  return row?.at ?? null;
}

/* ---------------------------------------------------------- audit trail */

export async function logAudit(input: {
  user?: SessionUser | null;
  action: string;
  entity: string;
  entityId?: string | number | null;
  companyId?: number | null;
  details?: unknown;
}) {
  try {
    await db.insert(auditLogs).values({
      userId: input.user?.id ?? null,
      actorEmail: input.user?.email ?? "system",
      action: input.action,
      entity: input.entity,
      entityId: input.entityId != null ? String(input.entityId) : null,
      companyId: input.companyId ?? input.user?.companyId ?? null,
      details: (input.details ?? null) as Record<string, unknown> | null,
    });
  } catch {
    // never let audit logging break a business operation
  }
}

/** Multi-tenant guard: resolves the company scope for the signed in user. */
export function companyScope(user: SessionUser): number | null {
  if (
    user.role === "super_admin" ||
    user.role === "ops_manager" ||
    user.role === "dispatcher" ||
    user.role === "fleet_manager" ||
    user.role === "finance_officer"
  ) {
    return null; // platform staff see all companies
  }
  return user.companyId ?? null;
}

/**
 * Resolve the company a scoped user may write to.
 *
 * Platform staff may target any company; a corporate administrator may only
 * ever touch their own. Returns `null` when the request asks for a company the
 * caller is not allowed to write to.
 */
export function writableCompanyId(
  user: SessionUser,
  requested: number | null | undefined,
): number | null | undefined {
  const scope = companyScope(user);
  if (scope == null) return requested ?? null;
  if (requested == null) return scope;
  return requested === scope ? scope : null;
}
