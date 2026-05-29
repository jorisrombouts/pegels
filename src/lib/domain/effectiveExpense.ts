import type { Account, Transaction } from "./types";

/**
 * The single source of truth for spending math (PRD §5.7, §7.1).
 *
 * A transaction counts as spending iff:
 *  - amount < 0, AND
 *  - !ignored, AND
 *  - its account is not a `savings` kind, AND
 *  - (if split) only the `mine` portions count.
 *
 * Every SEK figure shown in the app must route through this — never sum
 * `amount` directly.
 */
export function effectiveExpense(tx: Transaction, account: Account | undefined): number {
  if (tx.ignored) return 0;
  if (account?.kind === "savings") return 0;
  if (tx.amount >= 0) return 0; // income / transfer-in is not spending

  if (tx.splits && tx.splits.length > 0) {
    return tx.splits.reduce((sum, s) => (s.mine ? sum + Math.abs(s.amount) : sum), 0);
  }
  return Math.abs(tx.amount);
}

/**
 * Net of *included* transactions for a month row (PRD §6.2): signed sum over
 * non-ignored rows, with split transactions reduced to the `mine` portion.
 * Income stays positive; expenses stay negative.
 */
export function includedNet(tx: Transaction): number {
  if (tx.ignored) return 0;
  if (tx.amount < 0 && tx.splits && tx.splits.length > 0) {
    const mine = tx.splits.reduce((s, x) => (x.mine ? s + Math.abs(x.amount) : s), 0);
    return -mine;
  }
  return tx.amount;
}
