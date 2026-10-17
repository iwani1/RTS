/**
 * Phone numbers in one shape.
 *
 * Ghana numbers are stored in every local form a human can type — `0244...`,
 * `233244...`, `+233244...` — and providers want E.164. One place converts
 * between them so a message is never lost to a formatting mistake.
 */

/** The country the system operates in. */
export const DEFAULT_COUNTRY = "233";

/**
 * Convert a stored phone number to E.164 (`+233244012345`).
 *
 * Returns `null` when the number cannot be read as a phone number, so the
 * caller can record a failure instead of sending a message to nowhere.
 */
export function toE164(
  raw: string | null | undefined,
  country = DEFAULT_COUNTRY,
): string | null {
  if (!raw) return null;
  let digits = String(raw).replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (!digits) return null;

  if (digits.startsWith("0")) {
    // A local trunk prefix: 0 2x / 0 5x becomes the country code.
    digits = country + digits.slice(1);
  } else if (digits.length === 9) {
    // A bare local number without the trunk prefix.
    digits = country + digits;
  }

  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

/** The last four digits, used to describe a number without printing it. */
export function maskPhone(raw: string | null | undefined): string {
  const e164 = toE164(raw);
  if (!e164) return "no number on file";
  return `...${e164.slice(-4)}`;
}
