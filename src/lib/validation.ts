import { z } from "zod";

/**
 * Shared validation primitives.
 *
 * Every server action validates its input through this module. The helpers are
 * deliberately small: they produce a discriminated result so an action can
 * return a friendly error instead of throwing.
 */

export type Validation<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

export function ok<T>(value: T): Validation<T> {
  return { ok: true, value };
}

export function fail<T = never>(message: string): Validation<T> {
  return { ok: false, message };
}

/* ------------------------------------------------------------ primitives */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5, "Enter a valid email address.")
  .max(180, "Email is too long.")
  .email("Enter a valid email address.");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(200, "Password is too long.");

/** Ghanaian and international phone numbers, stored in a loose international form. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9\s()-]{6,19}$/, "Enter a valid phone number.");

export const nameSchema = z
  .string()
  .trim()
  .min(2, "Enter a name.")
  .max(120, "Name is too long.");

export const idSchema = z.coerce
  .number()
  .int("Must be a whole number.")
  .positive("Must be a positive number.")
  .max(2_147_483_647, "Number is out of range.");

export const moneySchema = z.coerce
  .number()
  .finite("Enter a valid amount.")
  .min(0, "Amount cannot be negative.")
  .max(1_000_000_000, "Amount is out of range.");

export const percentSchema = z.coerce
  .number()
  .finite("Enter a valid percentage.")
  .min(0, "Percentage cannot be negative.")
  .max(100, "Percentage cannot exceed 100.");

export const minutesSchema = z.coerce
  .number()
  .int("Must be a whole number of minutes.")
  .min(0, "Minutes cannot be negative.")
  .max(10_080, "Minutes must be under one week.");

export const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker.");

export const shortTextSchema = (max = 200) =>
  z.string().trim().max(max, `Must be ${max} characters or fewer.`);

export const requiredTextSchema = (max = 200, label = "This field") =>
  z.string().trim().min(1, `${label} is required.`).max(max, `Must be ${max} characters or fewer.`);

/* ------------------------------------------------------------ form readers */

function fieldValue(formData: FormData, key: string): string {
  const raw = formData.get(key);
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "string") return raw;
  if (raw instanceof File) return "";
  return String(raw);
}

/** Validate a single string field, returning `null` when the field is empty. */
export function optionalString(
  formData: FormData,
  key: string,
  schema: z.ZodType<string, string> = shortTextSchema(),
): Validation<string | null> {
  const raw = fieldValue(formData, key);
  if (!raw) return ok(null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid value.");
  return ok(parsed.data);
}

/** Validate a required string field. */
export function requiredString(
  formData: FormData,
  key: string,
  schema: z.ZodType<string, string>,
): Validation<string> {
  const raw = fieldValue(formData, key);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid value.");
  return ok(parsed.data);
}

/** Validate an optional numeric field, returning `null` when the field is empty. */
export function optionalNumber(
  formData: FormData,
  key: string,
  schema: z.ZodType<number, any> = idSchema,
): Validation<number | null> {
  const raw = fieldValue(formData, key).trim();
  if (!raw) return ok(null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid number.");
  return ok(parsed.data);
}

/** Validate a required numeric field. */
export function requiredNumber(
  formData: FormData,
  key: string,
  schema: z.ZodType<number, any> = idSchema,
): Validation<number> {
  const raw = fieldValue(formData, key).trim();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid number.");
  return ok(parsed.data);
}

/** Validate a field against an enum of allowed values. */
export function optionalEnum<T extends string>(
  formData: FormData,
  key: string,
  values: readonly T[],
): Validation<T | null> {
  const raw = fieldValue(formData, key).trim();
  if (!raw) return ok(null);
  if (!values.includes(raw as T)) {
    return fail(`Choose one of: ${values.join(", ")}.`);
  }
  return ok(raw as T);
}

/** Validate a checkbox field. */
export function checkbox(formData: FormData, key: string): boolean {
  const raw = formData.get(key);
  return raw === "on" || raw === "true" || raw === "1";
}

/**
 * Validate a password and its confirmation.
 * Returns the new password when they match, or an error message.
 */
export function passwordPair(
  formData: FormData,
  passwordKey: string,
  confirmKey: string,
): Validation<string> {
  const password = String(formData.get(passwordKey) ?? "");
  const confirm = String(formData.get(confirmKey) ?? "");
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Password is too short.");
  }
  if (password !== confirm) {
    return fail("The two passwords do not match.");
  }
  return ok(password);
}

/** Validate a whole object from a FormData bag. */
export function parseForm<T extends z.ZodTypeAny>(
  formData: FormData,
  schema: T,
): Validation<z.infer<T>> {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      raw[key] = value;
    }
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.join(".") || "form";
    return fail(`${path}: ${issue?.message ?? "Invalid value."}`);
  }
  return ok(parsed.data);
}
