/**
 * Multicurrency.
 *
 * Every money amount in the database is stored in the currency of the
 * agreement it came from. The base currency is GHS (the Ghanaian cedi) and
 * `exchange_rates` holds the rate of every other currency against it.
 *
 * Rates are indicative. The rate table is seeded with a documented snapshot
 * and can be refreshed by an operator; a production deployment should pull
 * live rates from a provider and record the rate that was actually used on
 * the invoice, so a historical invoice never re-prices.
 */
import { db } from "@/db";
import { exchangeRates } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const BASE_CURRENCY = "GHS";

export type Currency = {
  code: string;
  name: string;
  /** Units of this currency per one GHS. */
  rateToBase: number;
  symbol: string;
  isBase: boolean;
  asOf: string;
};

let cache: { at: number; rows: Currency[] } | null = null;
const CACHE_MS = 60_000;

function rowToCurrency(row: typeof exchangeRates.$inferSelect): Currency {
  return {
    code: row.code,
    name: row.name,
    rateToBase: Number(row.rateToBase),
    symbol: row.symbol,
    isBase: row.isBase,
    asOf: String(row.asOf).slice(0, 10),
  };
}

/** Every configured currency, most recently dated first. */
export async function listCurrencies(): Promise<Currency[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  const rows = await db
    .select()
    .from(exchangeRates)
    .orderBy(desc(exchangeRates.asOf));
  const mapped = rows.map(rowToCurrency);
  cache = { at: Date.now(), rows: mapped };
  return mapped;
}

export async function getCurrency(code: string): Promise<Currency | null> {
  const rows = await listCurrencies();
  return rows.find((c) => c.code === code) ?? null;
}

/**
 * Convert an amount between currencies.
 *
 * `amount` is in `from`; the result is in `to`. Rates are "units of X per
 * one GHS", so the conversion goes through the base currency.
 */
export function convert(
  amount: number,
  from: string,
  to: string,
  rates: Currency[],
): number {
  if (from === to) return amount;
  const source = rates.find((r) => r.code === from);
  const target = rates.find((r) => r.code === to);
  if (!source || !target) return amount;
  const inBase = amount / (source.rateToBase || 1);
  return inBase * (target.rateToBase || 1);
}

/** Format an amount in a currency, using the symbol when one is known. */
export function formatMoney(
  amount: number,
  currency: string,
  rates: Currency[] = [],
): string {
  const known = rates.find((r) => r.code === currency);
  const symbol = known?.symbol ?? currency;
  const value = amount.toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol} ${value}`;
}

/** Format an amount, converting it into the target currency first. */
export function formatConverted(
  amount: number,
  from: string,
  to: string,
  rates: Currency[],
): string {
  return formatMoney(convert(amount, from, to, rates), to, rates);
}
