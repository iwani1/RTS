/**
 * TOTP (RFC 6238) and one-time codes.
 *
 * Two different things live here on purpose, because they share the same
 * verification plumbing:
 *
 *  - **TOTP** is what an authenticator app generates. A shared base32
 *    secret is enrolled once, then every 30 seconds the app derives a
 *    six-digit code from it.
 *  - **One-time codes** are the single-use codes sent over SMS or email for
 *    phone sign-in, password recovery and boarding verification. The code
 *    itself is never stored — only a hash of it.
 */
import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/* ------------------------------------------------------------------ TOTP */

export function generateBase32Secret(bytes = 20): string {
  const buffer = randomBytes(bytes);
  let output = "";
  let bits = 0;
  let value = 0;
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32ToBuffer(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** The HOTP value for a counter, as a six-digit string. */
export function hotp(secret: string, counter: number): string {
  const key = base32ToBuffer(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

/** The TOTP code for a point in time. */
export function totp(secret: string, timestampMs = Date.now(), period = 30): string {
  const counter = Math.floor(timestampMs / 1000 / period);
  return hotp(secret, counter);
}

/**
 * Verify a TOTP code, allowing a small clock drift in either direction.
 * A one-period window either way is the usual compromise between
 * convenience and a replay window.
 */
export function verifyTotp(
  secret: string,
  code: string,
  timestampMs = Date.now(),
  window = 1,
): boolean {
  const clean = String(code ?? "").replace(/\D/g, "");
  if (clean.length !== 6) return false;
  const period = 30;
  const counter = Math.floor(timestampMs / 1000 / period);
  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = hotp(secret, counter + offset);
    if (safeEqual(candidate, clean)) return true;
  }
  return false;
}

/** The `otpauth://` URI an authenticator app scans. */
export function otpauthUri(
  secret: string,
  account: string,
  issuer = "StaffRide",
): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/* ------------------------------------------------- one-time codes (OTP) */

/** A six-digit one-time code. */
export function generateOtpCode(): string {
  const value = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return String(value).padStart(6, "0");
}

/** Hash a one-time code for storage. The plaintext is never persisted. */
export function hashOtpCode(code: string): string {
  return createHash("sha256").update(`${code}:staffride`).digest("hex");
}

/** Constant-time comparison of two strings of the same length. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
