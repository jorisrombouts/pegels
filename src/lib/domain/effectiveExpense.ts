import type { Transaction } from "./types";

/**
 * The single source of truth for spending math (PRD §5.7, §7.1).
 *
 * A transaction counts as spending iff:
 *  - its `kind` is `expense` (income and transfers never count), AND
 *  - amount < 0, AND
 *  - (if split) only the `mine` portions count.
 *
 * Every SEK figure shown in the app must route through this — never sum
 * `amount` directly.
 */
export function effectiveExpense(tx: Transaction): number {
  if (tx.excluded) return 0; // user flagged it "don't count"
  if (tx.kind !== "expense") return 0; // income & transfers never count as spend
  if (tx.amount >= 0) return 0;
  if (tx.splits && tx.splits.length > 0) {
    return tx.splits.reduce((sum, s) => (s.mine ? sum + Math.abs(s.amount) : sum), 0);
  }
  return Math.abs(tx.amount);
}

/**
 * Net of *included* transactions for a month row (PRD §6.2): only `expense`-kind
 * rows contribute, with split transactions reduced to the `mine` portion.
 * Expenses stay negative; income and transfers contribute nothing.
 */
export function includedNet(tx: Transaction): number {
  if (tx.excluded) return 0; // user flagged it "don't count"
  if (tx.kind !== "expense") return 0; // only expenses contribute to month spend/net now
  if (tx.splits && tx.splits.length > 0) {
    return -tx.splits.reduce((s, x) => (x.mine ? s + Math.abs(x.amount) : s), 0);
  }
  return tx.amount;
}
