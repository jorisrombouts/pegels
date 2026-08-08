/**
 * Loose merchant matching, used by the lexical arm of retrieval and by the confidence clamp.
 *
 * Pure and dependency-free on purpose: `retrieve.ts` reaches the database, so anything that only
 * needs these tokens must not have to import that module to get them.
 */

/** Letter-only tokens (digits dropped), lowercased, length >= 3. */
export function merchantTokens(desc: string): string[] {
  return (desc.toLowerCase().match(/[a-zåäö]+/g) ?? []).filter((t) => t.length >= 3);
}

/** Jaccard overlap of two token sets, 0..1. */
export function tokenOverlap(a: Set<string>, b: string[]): number {
  if (a.size === 0 || b.length === 0) return 0;
  const bSet = new Set(b);
  let shared = 0;
  for (const t of bSet) if (a.has(t)) shared += 1;
  if (shared === 0) return 0;
  return shared / (a.size + bSet.size - shared);
}
