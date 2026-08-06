/**
 * Merging the two retrieval arms.
 *
 * Reciprocal rank fusion rather than score normalisation: cosine similarity and lexical overlap
 * aren't on comparable scales, and RRF only needs the ranks. An id both arms surface outranks one
 * that only a single arm found, which is exactly the behaviour we want from a hybrid.
 *
 * All pure and table-testable, so the eval harness can sweep the constants.
 */

/** Standard RRF damping. Larger flattens the contribution of top ranks. */
export const RRF_K = 60;
export const W_VECTOR = 1.0;
export const W_LEXICAL = 1.0;
/** Neighbours shown to the model per row. */
export const NEIGHBOURS_PER_ROW = 6;
/** Multiplier applied when a candidate's amount is the same order of magnitude as the query's. */
export const AMOUNT_BONUS = 0.1;

export function rrf(lists: { weight: number; ids: string[] }[]): { id: string; score: number }[] {
  const scores = new Map<string, number>();
  for (const { weight, ids } of lists) {
    ids.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + weight / (RRF_K + rank));
    });
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Same order of magnitude — within roughly 3x either way.
 *
 * This is how the amount influences retrieval. Embedding it instead would make it ~60% of the
 * token mass of a 4-token merchant string and cluster the vector space by size rather than by
 * merchant, so it is applied here as a re-rank nudge.
 */
export function sameMagnitude(a: number, b: number): boolean {
  const x = Math.abs(a);
  const y = Math.abs(b);
  if (x === 0 || y === 0) return false;
  return Math.abs(Math.log10(x / y)) < 0.5;
}

/**
 * Keep at most one entry per group, preserving rank order.
 *
 * Without this a merchant corrected forty times could fill every neighbour slot with itself and
 * crowd out the contrast the model needs.
 */
export function diversify<T>(ranked: T[], keyOf: (t: T) => string, limit: number): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of ranked) {
    if (out.length >= limit) break;
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
