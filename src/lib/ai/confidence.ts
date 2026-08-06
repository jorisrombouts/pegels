import { REVIEW_THRESHOLD } from "@/lib/domain/review";

/** What retrieval found for a row — the one calibration signal we actually control. */
export interface RetrievalEvidence {
  neighbourCount: number;
  /** Merchant-token overlap with the closest neighbour, 0..1. */
  topOverlap: number;
  topNeighbourCategoryId: string | null;
}

/** Above this, the closest neighbour is effectively the same merchant. */
const STRONG_OVERLAP = 0.8;
/** Ceiling applied when retrieval found nothing at all. */
const UNSEEN_CEILING = REVIEW_THRESHOLD - 0.01;
/** Floor applied when a near-exact neighbour agrees with the model. */
const SETTLED_FLOOR = 0.95;

/**
 * Re-anchor the model's self-reported confidence against what retrieval actually found.
 *
 * The raw number is uncalibrated — the model invents it — and it drives the needs-review queue.
 * Two adjustments make that queue mean something concrete without any calibration machinery:
 *
 *  - **Nothing retrieved → forced under the review threshold.** The queue then reads as "the
 *    system has never seen this merchant", which is precisely what deserves a human. This is also
 *    what makes cold start self-healing: unseen rows surface, get corrected, and enter the corpus.
 *  - **A near-exact neighbour the model agreed with → promoted.** A merchant that is settled
 *    stops consuming review attention.
 */
export function clampConfidence(
  modelConfidence: number,
  evidence: RetrievalEvidence,
  chosenCategoryId: string | null,
): number {
  const c = Math.min(1, Math.max(0, modelConfidence));

  if (evidence.neighbourCount === 0) return Math.min(c, UNSEEN_CEILING);

  const agrees = evidence.topNeighbourCategoryId === chosenCategoryId;
  if (evidence.topOverlap >= STRONG_OVERLAP && agrees) return Math.max(c, SETTLED_FLOOR);

  return c;
}
