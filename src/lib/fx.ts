/** Pure currency-conversion helpers for the import path. No I/O — the network lives in the fx action. */

import type { RevolutRow } from "./parse-revolut";

/** Frankfurter returns rates with base=SEK (1 SEK = rates[X] of X). Invert to <currency>→SEK. */
export function invertToSEK(sekBaseRates: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { SEK: 1 };
  for (const [code, perSek] of Object.entries(sekBaseRates)) {
    if (perSek > 0) out[code] = 1 / perSek;
  }
  return out;
}

export interface ConvertedRow extends RevolutRow {
  /** Set for converted (non-SEK) rows: the original amount + rate, for the transaction note. */
  fxNote?: string;
  /** True when a non-SEK row had no rate available; the amount is left in its original currency. */
  unconverted?: boolean;
}

/** Distinct non-SEK currencies present in the rows (the set of rates to fetch). */
export function foreignCurrencies(rows: { currency: string }[]): string[] {
  return [...new Set(rows.map((r) => r.currency).filter((c) => c && c !== "SEK"))];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const trim = (n: number) => Number(n.toFixed(4)); // drop trailing zeros for the note

/** Convert each row's amount to SEK using `ratesToSEK` (code→SEK, with SEK:1). Pure. */
export function convertRowsToSEK(
  rows: RevolutRow[],
  ratesToSEK: Record<string, number>,
): { rows: ConvertedRow[]; unconvertedCurrencies: string[] } {
  const unconverted = new Set<string>();
  const out = rows.map((r): ConvertedRow => {
    if (r.currency === "SEK") return { ...r };
    const rate = ratesToSEK[r.currency];
    if (!rate) {
      unconverted.add(r.currency);
      return { ...r, unconverted: true };
    }
    return {
      ...r,
      amount: round2(r.amount * rate),
      fxNote: `${r.amount.toFixed(2)} ${r.currency} @ ${trim(rate)}`,
    };
  });
  return { rows: out, unconvertedCurrencies: [...unconverted] };
}
