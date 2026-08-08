/**
 * Deterministic hashing for the eval hold-out.
 *
 * FNV-1a rather than `Math.random()` so the value is reproducible across runs.
 * assigned the same way, which is what lets accuracy be compared across runs. The result is
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
