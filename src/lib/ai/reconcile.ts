import type { AiResult } from "./categorize-openai";
import type { TransactionKind } from "@/lib/domain/types";

/**
 * Enforce the sign convention (negative = expense, positive = income) the LLM can violate.
 * Transfers move in either direction, so they're left untouched; a kind flipped to a non-expense
 * also drops its category (only expenses carry one).
 */
export function reconcileKindWithSign(res: AiResult, amount: number): void {
  if (res.kind === "transfer" || amount === 0) return;
  const expected: TransactionKind = amount < 0 ? "expense" : "income";
  if (res.kind !== expected) {
    res.kind = expected;
    if (expected !== "expense") res.categoryId = null;
  }
}
