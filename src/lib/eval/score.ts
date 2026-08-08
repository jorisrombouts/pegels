import { stableHash } from "@/lib/ai/hash";
import type { AiResult } from "@/lib/ai/categorize-openai";
import type { CorpusRow } from "@/lib/corpus/types";

/** Enough to steady the number without a long wait or a large bill. */
export const SAMPLE_SIZE = 60;

export interface Miss {
  /** What the user confirmed. */
  expected: string | null;
  /** What the categorizer said instead. */
  got: string | null;
}

export interface AccuracyScore {
  /** Places actually scored. */
  sampled: number;
  correct: number;
  /** Share of sampled places whose category the model reproduced, 0..1. */
  accuracy: number;
  /**
   * Every disagreement, kept rather than counted and discarded. A score says something is wrong;
   * these say *what*, and two near-synonymous categories showing up repeatedly is a taxonomy
   * problem the model cannot fix.
   */
  misses: Miss[];
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
  const misses: Miss[] = [];
  let correct = 0;
  sample.forEach((row, i) => {
    const got = byIndex.get(i);
    // No answer is a wrong answer: the row went unclassified, which is not a correct label.
    if (got && got.categoryId === row.finalCategoryId) correct += 1;
    else misses.push({ expected: row.finalCategoryId, got: got?.categoryId ?? null });
  });
  return {
    sampled: sample.length,
    correct,
    accuracy: sample.length ? correct / sample.length : 0,
    misses,
  };
}

/** Collapse misses into the pairs worth acting on, commonest first. */
export function confusionPairs(misses: Miss[]): { expected: string | null; got: string | null; count: number }[] {
  const counts = new Map<string, { expected: string | null; got: string | null; count: number }>();
  for (const m of misses) {
    const key = `${m.expected}>${m.got}`;
    const hit = counts.get(key);
    if (hit) hit.count += 1;
    else counts.set(key, { ...m, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}
