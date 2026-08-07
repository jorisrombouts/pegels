import { rootCategoryId, type Maps } from "@/lib/domain/selectors";
import { needsReview } from "@/lib/domain/review";
import type { AiResult } from "@/lib/ai/categorize-openai";
import type { TransactionKind } from "@/lib/domain/types";
import type { EvalMetrics, MetricBucket } from "./types";

/** A held-out example, scored against what the pipeline predicts for it. */
export interface GoldExample {
  description: string;
  amount: number;
  finalKind: TransactionKind;
  finalCategoryId: string | null;
  finalTagIds: string[];
  /** A lexically similar merchant exists in the retrievable corpus — so this is closer to a
   *  lookup than a prediction, and must be reported separately. */
  seen: boolean;
}

interface Scored {
  gold: GoldExample;
  kindOk: boolean;
  categoryOk: boolean;
  rootOk: boolean;
  tagHits: number;
  tagPredicted: number;
  tagExpected: number;
  confidence: number;
  flagged: boolean;
  correct: boolean;
}

const EMPTY: MetricBucket = {
  n: 0, kindAccuracy: 0, categoryAccuracy: 0, categoryAccuracyRoot: 0,
  tagPrecision: 0, tagRecall: 0, tagF1: 0,
};

function share(hits: number, total: number): number {
  return total === 0 ? 0 : hits / total;
}

function bucket(scored: Scored[]): MetricBucket {
  if (!scored.length) return { ...EMPTY };
  const sum = (f: (s: Scored) => number) => scored.reduce((t, s) => t + f(s), 0);

  // Micro-averaged over (row, tag) pairs: tags are sparse, and macro-averaging would let one rare
  // tag outweigh a common one.
  const hits = sum((s) => s.tagHits);
  const predicted = sum((s) => s.tagPredicted);
  const expected = sum((s) => s.tagExpected);
  // Rows where both sides agree there are no tags are perfect, not undefined — most rows have none,
  // and scoring them zero would drown the signal.
  const tagPrecision = predicted === 0 ? (expected === 0 ? 1 : 0) : hits / predicted;
  const tagRecall = expected === 0 ? (predicted === 0 ? 1 : 0) : hits / expected;
  const tagF1 = tagPrecision + tagRecall === 0 ? 0 : (2 * tagPrecision * tagRecall) / (tagPrecision + tagRecall);

  return {
    n: scored.length,
    kindAccuracy: share(sum((s) => (s.kindOk ? 1 : 0)), scored.length),
    categoryAccuracy: share(sum((s) => (s.categoryOk ? 1 : 0)), scored.length),
    categoryAccuracyRoot: share(sum((s) => (s.rootOk ? 1 : 0)), scored.length),
    tagPrecision, tagRecall, tagF1,
  };
}

/**
 * Score predictions against the hold-out.
 *
 * Pure and predictor-injected: the runner supplies `predictions`, so scoring is unit-testable with
 * no network and no database.
 *
 * Every accuracy is reported three ways — overall, seen and unseen. A gold example whose merchant
 * is already in the corpus is a lookup, not a prediction, and inflates the headline; the unseen
 * number is the one that predicts how the next import will actually feel.
 */
export function evaluate(gold: GoldExample[], predictions: AiResult[], maps: Maps): EvalMetrics {
  const byIndex = new Map(predictions.map((p) => [p.index, p]));

  const scored: Scored[] = gold.map((g, i) => {
    const p = byIndex.get(i);
    // A row the model never answered is wrong, not absent — skipping it would flatter the score.
    if (!p) {
      return {
        gold: g, kindOk: false, categoryOk: false, rootOk: false,
        tagHits: 0, tagPredicted: 0, tagExpected: g.finalTagIds.length,
        confidence: 0, flagged: true, correct: false,
      };
    }

    const kindOk = p.kind === g.finalKind;
    const categoryOk = p.categoryId === g.finalCategoryId;
    const rootOk =
      rootCategoryId(p.categoryId, maps.categoryById) === rootCategoryId(g.finalCategoryId, maps.categoryById);

    const expected = new Set(g.finalTagIds);
    const tagHits = p.tagIds.filter((t) => expected.has(t)).length;

    return {
      gold: g,
      kindOk, categoryOk, rootOk,
      tagHits, tagPredicted: p.tagIds.length, tagExpected: g.finalTagIds.length,
      confidence: p.confidence,
      flagged: needsReview(p.level),
      correct: kindOk && categoryOk,
    };
  });

  const right = scored.filter((s) => s.correct);
  const wrong = scored.filter((s) => !s.correct);
  const flagged = scored.filter((s) => s.flagged);
  const mean = (rows: Scored[]) => (rows.length ? rows.reduce((t, s) => t + s.confidence, 0) / rows.length : 0);

  return {
    overall: bucket(scored),
    seen: bucket(scored.filter((s) => s.gold.seen)),
    unseen: bucket(scored.filter((s) => !s.gold.seen)),
    meanConfidenceCorrect: mean(right),
    meanConfidenceWrong: mean(wrong),
    reviewFlagged: flagged.length,
    reviewPrecision: share(flagged.filter((s) => !s.correct).length, flagged.length),
  };
}
