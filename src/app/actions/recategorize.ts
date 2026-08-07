"use server";

import { getUserId } from "@/lib/auth";
import { bulkUpsertTransactions, getDataset } from "@/lib/db/queries";
import { needsReview } from "@/lib/domain/review";
import { diffRecategorization, selectForRecategorize } from "@/lib/corpus/recategorize";
import type { RecategorizeChange, RecategorizeScope } from "@/lib/corpus/recategorize";
import { categorizeTransactions } from "./ai";

// NOTE: a "use server" module may only export async functions — see server-actions.test.ts.

/** Rows per preview. A pass over everything would be a long call and an unreadable dialog. */
const PREVIEW_LIMIT = 300;

/**
 * Re-run categorization over transactions an older pipeline classified, and report what would
 * change — without changing anything.
 *
 * Hand-corrected rows are never included, at any scope.
 */
export async function previewRecategorize(
  scope: RecategorizeScope,
  month?: string,
): Promise<{ changes: RecategorizeChange[]; unchanged: number; truncated: boolean }> {
  const userId = await getUserId();
  const data = await getDataset(userId);

  const all = selectForRecategorize(data.transactions, scope, month);
  const candidates = all.slice(0, PREVIEW_LIMIT);
  if (!candidates.length) return { changes: [], unchanged: 0, truncated: false };

  const results = await categorizeTransactions(
    candidates.map((t, index) => ({ index, description: t.description, amount: t.amount })),
  );
  const { changes, unchanged } = diffRecategorization(candidates, results);
  return { changes, unchanged, truncated: all.length > candidates.length };
}

/**
 * Apply changes the user has already seen.
 *
 * Takes the previewed changes back rather than re-running the model: the user applies exactly
 * what was shown, with no drift between preview and apply, and no second API spend.
 *
 * Deliberately writes **no** corpus examples. The model's own output is not evidence — recording
 * it would be the classic feedback loop where a system trains on its own predictions.
 */
export async function applyRecategorize(changes: RecategorizeChange[]): Promise<number> {
  if (!changes.length) return 0;
  const userId = await getUserId();
  const data = await getDataset(userId);
  const byId = new Map(data.transactions.map((t) => [t.id, t]));

  const updated = changes.flatMap((c) => {
    const tx = byId.get(c.id);
    // Guard again at apply time: the row may have been hand-corrected since the preview.
    if (!tx || tx.categorySource === "user") return [];
    return [{
      ...tx,
      kind: c.after.kind,
      categoryId: c.after.categoryId,
      tagIds: c.after.tagIds,
      predictedCategoryId: c.after.categoryId,
      categoryConfidence: c.after.confidence,
      categoryLevel: c.after.level,
      categorySource: "model" as const,
      needsReview: needsReview(c.after.level),
    }];
  });

  await bulkUpsertTransactions(userId, updated);
  return updated.length;
}
