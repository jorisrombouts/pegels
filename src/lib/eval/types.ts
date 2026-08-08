/**
 * Eval result shapes. Kept in their own module (no imports) so `db/schema.ts` can type the
 * `eval_runs` JSONB columns without dragging the eval runner into the schema's import graph.
 */

/** One metric bucket. Reported three times over: overall, seen-merchant, unseen-merchant. */
export interface MetricBucket {
  /** How many gold examples fell in this bucket. Guards against reading noise as signal. */
  n: number;
  kindAccuracy: number;
  /** Exact categoryId match. `null === null` counts as correct. */
  categoryAccuracy: number;
  /** Same, compared at the top-level category. Confusing Café with Restaurants is a rounding
   *  error; confusing Food with Housing is a real failure. Divergence tells you which you have. */
  categoryAccuracyRoot: number;
  /** Micro-averaged over (row, tagId) pairs — tags are sparse, so macro would let a rare tag dominate. */
  tagPrecision: number;
  tagRecall: number;
  tagF1: number;
}

export interface EvalMetrics {
  overall: MetricBucket;
  /** The merchant already appears in the corpus — a lookup, not a prediction. */
  seen: MetricBucket;
  /** The merchant is new. This is the number that predicts how the next import will feel. */
  unseen: MetricBucket;
  /** If these are equal, `confidence` is noise and the review queue is random. */
  meanConfidenceCorrect: number;
  meanConfidenceWrong: number;
  /** Of the rows flagged needs-review, the share that were actually wrong. */
  reviewPrecision: number;
  reviewFlagged: number;
}

export interface EvalMistake {
  description: string;
  amount: number;
  expectedKind: string;
  actualKind: string;
  expectedCategoryId: string | null;
  actualCategoryId: string | null;
  expectedTagIds: string[];
  actualTagIds: string[];
  confidence: number;
  seen: boolean;
}
