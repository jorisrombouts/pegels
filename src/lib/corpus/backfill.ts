import type { Transaction } from "@/lib/domain/types";
import type { ExampleInput } from "./record";

/**
 * Seed the corpus from categorizations the user already made by hand.
 *
 * Months of `categorySource: "user"` transactions are the highest-signal evidence available, and
 * until now nothing read them — they carry real categories *and* real tags, which is what turns tag
 * prediction from a prior into something learned.
 *
 * Pure: no database, no network.
 */

/** Below this a model row is a guess, not something to seed the corpus with. */
const MODEL_CONFIDENCE_FLOOR = 0.9;

export interface BackfillOptions {
  /** Include confident, unflagged model rows. Off by default — the model agreeing with itself
   *  is not evidence, but it can give a thin corpus mass to work with. */
  includeHighConfidenceModel: boolean;
}

export function planCorpusBackfill(transactions: Transaction[], opts: BackfillOptions): ExampleInput[] {
  const out: ExampleInput[] = [];

  for (const tx of transactions) {
    if (tx.excluded) continue;

    const handLabelled = tx.categorySource === "user";
    if (!handLabelled) {
      if (!opts.includeHighConfidenceModel) continue;
      if (tx.needsReview) continue;
      if ((tx.categoryConfidence ?? 0) < MODEL_CONFIDENCE_FLOOR) continue;
    }

    // An expense with no category teaches nothing. A transfer or income row still teaches `kind`.
    if (tx.categoryId === null && tx.kind === "expense") continue;

    out.push({
      rawDescription: tx.description,
      cleanedDescription: tx.description,
      amount: tx.amount,
      predictedKind: null, // never recorded on a transaction; see record.isCorrected
      predictedCategoryId: tx.predictedCategoryId,
      predictedTagIds: null,
      predictedConfidence: tx.categoryConfidence,
      finalKind: tx.kind,
      finalCategoryId: tx.categoryId,
      finalTagIds: tx.tagIds,
    });
  }

  return out;
}
