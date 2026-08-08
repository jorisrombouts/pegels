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

/**
 * Default hold-out share, in percent.
 *
 * Zero: nothing is held out automatically. A hold-out only pays for itself if evals actually run,
 * and until one does, every held-out row is evidence the categorizer is forbidden to use. On a
 * single-user corpus that cost lands hard — a 20% share took ICA (172 sightings) and SL (109) out
 * of retrieval, so the most-seen merchants in the app were the ones it could not learn.
 *
 * Deliberate hold-out is still available per row via the toggle on the training page, and callers
 * can pass an explicit pct to build an eval set when there is an eval to run.
 */
export const GOLD_PCT = 0;

export function isGoldByHash(id: string, pct = GOLD_PCT): boolean {
  return stableHash(id) % 100 < pct;
}
