import { stableHash } from "@/lib/ai/hash";
import type { AiResult } from "@/lib/ai/categorize-openai";
import type { CorpusRow } from "@/lib/corpus/types";

/** Enough to steady the number without a long wait or a large bill. */
export const SAMPLE_SIZE = 60;

export interface AccuracyScore {
  /** Places actually scored. */
  sampled: number;
  /** Approved places available to sample from. */
  available: number;
  correct: number;
  /** Share of sampled places whose category the model reproduced, 0..1. */
  accuracy: number;
}

/**
 * A stable sample, so the number moves when the categorizer changes rather than when the dice do.
 *
 * Random sampling would make two runs an hour apart differ by several points for no reason, which
 * is exactly the noise that makes a trend line unreadable. Hashing the id fixes the membership: the
 * same places are scored every time until the corpus itself changes.
 */
export function sampleForScoring(rows: CorpusRow[], size = SAMPLE_SIZE): CorpusRow[] {
  if (rows.length <= size) return rows;
  return [...rows].sort((a, b) => stableHash(a.id) - stableHash(b.id)).slice(0, size);
}

/**
 * Compare what the categorizer said against what the user confirmed.
 *
 * Only the category is scored. Kind is largely settled by the amount's sign before the model sees
 * it, and tags are genuinely multi-valued — "Fixed cost" and "Subscription" can both be right — so
 * counting either would report agreement the user never asked for.
 */
export function scoreAccuracy(sample: CorpusRow[], results: AiResult[]): AccuracyScore {
  const byIndex = new Map(results.map((r) => [r.index, r]));
  let correct = 0;
  sample.forEach((row, i) => {
    const got = byIndex.get(i);
    // No answer is a wrong answer: the row went unclassified, which is not a correct label.
    if (got && got.categoryId === row.finalCategoryId) correct += 1;
  });
  return {
    sampled: sample.length,
    available: sample.length,
    correct,
    accuracy: sample.length ? correct / sample.length : 0,
  };
}
