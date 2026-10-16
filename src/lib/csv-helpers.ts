import { parseCsv } from "./utils";

/** Validates a CSV payload before it reaches the database. */
export function parseCsvSafe(csv: string): Array<Record<string, string>> {
  const rows = parseCsv(csv);
  return rows.filter((r) => Object.values(r).some((v) => v !== ""));
}

export function generateToken(length = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
