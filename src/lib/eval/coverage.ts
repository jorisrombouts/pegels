import { normalizeMerchant } from "@/lib/ai/normalize";
import type { Neighbour } from "@/lib/ai/retrieve";

export interface Coverage {
  /** Transactions considered. */
  total: number;
  /** Transactions whose own place is already confirmed and retrievable. */
  covered: number;
  /** 0..1. */
  share: number;
}

/**
 * How often an incoming transaction lands on a place the categorizer already knows.
 *
 * "Knows" means the real hybrid retrieval returns *this merchant itself*, not merely something
 * related — a neighbour whose dedup key matches the transaction's own. A related-but-different
 * place is what the model falls back on when it has never seen this one, which is precisely the
 * case this is meant to separate out.
 *
 * Deliberately measured through `retrieveNeighbours` rather than a substring or token check of its
 * own: a proxy would drift from the retrieval it claims to describe, and then the number would
 * describe a system nobody runs.
 */
export function coverageFrom(
  transactions: { index: number; description: string }[],
  neighbours: Map<number, Neighbour[]>,
): Coverage {
  let covered = 0;
  for (const tx of transactions) {
    const key = normalizeMerchant(tx.description);
    if ((neighbours.get(tx.index) ?? []).some((n) => n.dedupKey === key)) covered += 1;
  }
  return { total: transactions.length, covered, share: transactions.length ? covered / transactions.length : 0 };
}

/**
 * Expected accuracy on the next transaction, given the two regimes it can land in.
 *
 * The single number people actually want, stated so its parts stay visible: mostly-known places at
 * one hit rate, the occasional new one at another. Kept as a function rather than a stored column
 * because it is arithmetic over two measurements, and storing a derived value invites the two
 * drifting apart.
 */
export function blendedAccuracy(coverage: number, seen: number, unseen: number): number {
  return coverage * seen + (1 - coverage) * unseen;
}
