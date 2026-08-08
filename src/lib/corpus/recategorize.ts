import { monthKey } from "@/lib/format";
import type { AiResult } from "@/lib/ai/categorize-openai";
import type { Transaction, TransactionKind } from "@/lib/domain/types";
import type { ConfidenceLevel } from "@/lib/ai/confidence";

/**
 * Re-running the categorizer over transactions that were classified by an older pipeline.
 *
 * Pure — the selection and the diff are where the correctness lives, so they are testable without
 * a database or an API key.
 */

export type RecategorizeScope = "needs-review" | "uncategorized" | "month" | "all-model" | "all-including-user";

export interface RecategorizeChange {
  id: string;
  description: string;
  amount: number;
  before: { kind: TransactionKind; categoryId: string | null; tagIds: string[] };
  after: { kind: TransactionKind; categoryId: string | null; tagIds: string[]; confidence: number; level: ConfidenceLevel };
}

/**
 * Which transactions are worth re-running.
 *
 * A hand-corrected row is never included, whatever the scope. Re-running the model over it would
 * undo the user's own work — and it is the very evidence the corpus learns from.
 */
export function selectForRecategorize(
  transactions: Transaction[],
  scope: RecategorizeScope,
  month?: string,
): Transaction[] {
  return transactions.filter((t) => {
    if (t.excluded) return false;
    // Hand corrections are normally off-limits — the model should not quietly overwrite a decision
    // the user made. "all-including-user" is the one scope that opts into revisiting them, and it
    // still only ever produces a preview the user has to apply.
    if (t.categorySource === "user" && scope !== "all-including-user") return false;

    switch (scope) {
      case "needs-review":
        return t.needsReview;
      case "uncategorized":
        // Transfers and income legitimately carry no category; only a bare expense is unfinished.
        return t.categoryId === null && t.kind === "expense";
      case "month":
        return month !== undefined && monthKey(t.date) === month;
      case "all-model":
      case "all-including-user":
        return true;
    }
  });
}

const sameTags = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");

/**
 * Compare fresh predictions against what is stored, keeping only what actually differs.
 *
 * `results` are matched by position in `transactions`, which is how the caller indexed them.
 */
export function diffRecategorization(
  transactions: Transaction[],
  results: AiResult[],
): { changes: RecategorizeChange[]; unchanged: number } {
  const byIndex = new Map(results.map((r) => [r.index, r]));
  const changes: RecategorizeChange[] = [];
  let unchanged = 0;

  transactions.forEach((t, i) => {
    const r = byIndex.get(i);
    // No answer means no information — leave the row exactly as it is.
    if (!r) {
      unchanged += 1;
      return;
    }
    const tags = t.tagIds ?? [];
    if (r.kind === t.kind && r.categoryId === t.categoryId && sameTags(r.tagIds, tags)) {
      unchanged += 1;
      return;
    }
    changes.push({
      id: t.id,
      description: t.description,
      amount: t.amount,
      before: { kind: t.kind, categoryId: t.categoryId, tagIds: tags },
      after: { kind: r.kind, categoryId: r.categoryId, tagIds: r.tagIds, confidence: r.confidence, level: r.level },
    });
  });

  return { changes, unchanged };
}
