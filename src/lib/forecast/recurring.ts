import { effectiveExpense } from "@/lib/domain/effectiveExpense";
import { inMonth, prevMonthKey } from "@/lib/domain/selectors";
import type { Transaction } from "@/lib/domain/types";
import { recurringKey } from "./normalize";
import { clamp01, mad, median } from "./stats";

/** A charge that repeats about once a month for a stable amount on a stable day. */
export interface RecurringCharge {
  /** `recurringKey` of the description — the grouping identity. */
  key: string;
  /** Most recent human-readable description, for the UI. */
  label: string;
  categoryId: string | null;
  /** Median of the most recent occurrences, so a price change is picked up quickly. */
  typicalAmount: number;
  /** Spread of the amount over the whole window; the match tolerance in the forecast keys off it. */
  amountMad: number;
  /** Median day of month it lands on. */
  typicalDay: number;
  occurrences: number;
  distinctMonths: number;
  /** 0..1. Gates whether a not-yet-landed charge is counted in the projection. */
  confidence: number;
}

const LOOKBACK_MONTHS = 6;
/** Three *separate* months. Occurrence count alone lets a burst of five grocery runs qualify. */
const MIN_DISTINCT_MONTHS = 3;
/** Roughly one per month — excludes a daily coffee shop. */
const MAX_PER_MONTH = 1.5;
/** Amount spread, relative to the median. */
const MAX_AMOUNT_SPREAD = 0.25;
/** Day-of-month spread. Rent on the 1st vs the 3rd is one charge; the 5th vs the 25th is not. */
const MAX_DAY_MAD = 4;
/** How many recent occurrences define the current price. */
const RECENT_FOR_PRICE = 3;

function dayOfMonth(isoDate: string): number {
  return Number(isoDate.slice(8, 10));
}

/** Trailing `count` completed month keys ending at the month before `key`, oldest first. */
function lookbackKeys(key: string, count: number): string[] {
  const keys: string[] = [];
  let k = prevMonthKey(key);
  for (let i = 0; i < count; i++) {
    keys.unshift(k);
    k = prevMonthKey(k);
  }
  return keys;
}

function modal<T>(values: T[]): T {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Find the charges that repeat monthly, over the completed months before `monthKey`.
 *
 * The current month is deliberately excluded: detection must not shift as the month fills in,
 * and the forecast matches this month's transactions against these charges separately.
 */
export function detectRecurring(
  transactions: Transaction[],
  monthKey: string,
  opts: { lookbackMonths?: number } = {},
): RecurringCharge[] {
  const lookbackMonths = opts.lookbackMonths ?? LOOKBACK_MONTHS;
  const window = new Set(lookbackKeys(monthKey, lookbackMonths));

  const groups = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    if (effectiveExpense(tx) <= 0) continue; // income, transfers, excluded and zero rows
    if (![...window].some((k) => inMonth(tx, k))) continue;
    const key = recurringKey(tx.description);
    if (!key) continue;
    const g = groups.get(key);
    if (g) g.push(tx);
    else groups.set(key, [tx]);
  }

  const out: RecurringCharge[] = [];
  for (const [key, txs] of groups) {
    const byDateDesc = [...txs].sort((a, b) => b.date.localeCompare(a.date));
    const amounts = txs.map(effectiveExpense);
    const days = txs.map((t) => dayOfMonth(t.date));
    const distinctMonths = new Set(txs.map((t) => t.date.slice(0, 7))).size;
    const occurrences = txs.length;

    if (distinctMonths < MIN_DISTINCT_MONTHS) continue;
    if (occurrences < MIN_DISTINCT_MONTHS) continue;
    if (occurrences > distinctMonths * MAX_PER_MONTH) continue;

    const amountMedian = median(amounts);
    if (amountMedian <= 0) continue;
    const amountMad = mad(amounts);
    if (amountMad / amountMedian > MAX_AMOUNT_SPREAD) continue;

    const dayMad = mad(days);
    if (dayMad > MAX_DAY_MAD) continue;

    // Stability is judged over the whole window, but the *price* is the recent one — so a rent
    // rise forecasts at the new amount instead of a historical median that no longer applies.
    const typicalAmount = median(byDateDesc.slice(0, RECENT_FOR_PRICE).map(effectiveExpense));

    const monthCoverage = clamp01(distinctMonths / lookbackMonths);
    const amountStability = clamp01(1 - amountMad / amountMedian / MAX_AMOUNT_SPREAD);
    const dayStability = clamp01(1 - dayMad / MAX_DAY_MAD);

    out.push({
      key,
      label: byDateDesc[0].description,
      categoryId: modal(txs.map((t) => t.categoryId)),
      typicalAmount,
      amountMad,
      typicalDay: Math.round(median(days)),
      occurrences,
      distinctMonths,
      confidence: monthCoverage * amountStability * dayStability,
    });
  }
  return out.sort((a, b) => b.typicalAmount - a.typicalAmount);
}
