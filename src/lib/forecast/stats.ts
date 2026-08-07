/** Robust summary statistics. Median + MAD rather than mean + stdev: a single outlier (an annual
 *  charge, a double rent payment) blows up stdev and would silently disqualify a genuinely fixed
 *  cost. Pure — no dates, no domain types. */

/** Median of a non-empty list. Even length averages the two middle values. */
export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Median absolute deviation from the median — a spread measure that ignores a minority of outliers. */
export function mad(values: number[]): number {
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
}

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
