/**
 * Deterministic hashing for the eval hold-out.
 *
 * FNV-1a rather than `Math.random()` so the gold set is reproducible: the same example is always
 * assigned the same way, which is what lets accuracy be compared across runs. The result is
 * materialised into the `gold` column at insert so the user can still override it per row.
 */

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

export function stableHash(s: string): number {
  let h = FNV_OFFSET;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

/** Default hold-out share, in percent. */
export const GOLD_PCT = 20;

export function isGoldByHash(id: string, pct = GOLD_PCT): boolean {
  return stableHash(id) % 100 < pct;
}
