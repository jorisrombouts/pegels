import { REVIEW_THRESHOLD } from "@/lib/domain/review";

/**
 * How much a categorization is worth trusting.
 *
 * This is deliberately **categorical**, not a percentage. The model's self-reported number is
 * uncalibrated — measured against the hold-out, its mean on correct answers (0.58) and on wrong
 * ones (0.53) are indistinguishable — so rendering "58%" claims a precision that does not exist.
 *
 * What we *do* know is factual: whether retrieval found this merchant, how closely, and whether
 * the model agreed with it. Those three facts are the real signal, and they name themselves.
 */
export type ConfidenceLevel = "unsure" | "likely" | "confirmed";

/** Least to most certain, so a UI can rank or compare them. */
export const CONFIDENCE_LEVELS: ConfidenceLevel[] = ["unsure", "likely", "confirmed"];

/** What retrieval found for a row — the one signal we control rather than infer. */
export interface RetrievalEvidence {
  neighbourCount: number;
  /** Merchant-token overlap with the closest neighbour, 0..1. */
  topOverlap: number;
  topNeighbourCategoryId: string | null;
}

/** Above this, the closest neighbour is effectively the same merchant. */
const STRONG_OVERLAP = 0.8;
/** Ceiling on the retained score when retrieval found nothing. */
const UNSEEN_CEILING = REVIEW_THRESHOLD - 0.01;
/** Floor on the retained score when a near-exact neighbour agrees. */
const SETTLED_FLOOR = 0.95;

export interface Confidence {
  level: ConfidenceLevel;
  /**
   * The model's number, re-anchored on the evidence. Kept because the eval scores calibration
   * with it — if it ever separates right from wrong answers, that is worth knowing. It is not
   * shown to the user.
   */
  score: number;
}

/**
 * Grade a prediction against what retrieval actually found.
 *
 *  - **unsure** — nothing retrieved. The system has never seen this merchant, which is precisely
 *    what deserves a human, and what makes cold start self-healing: these surface, get corrected,
 *    and become evidence. A confident-sounding model cannot talk its way out of this.
 *  - **confirmed** — a near-identical merchant in the approved corpus agrees with the answer.
 *  - **likely** — everything else: there was evidence, but nothing that settles it.
 */
export function gradeConfidence(
  modelConfidence: number,
  evidence: RetrievalEvidence,
  chosenCategoryId: string | null,
): Confidence {
  const c = Math.min(1, Math.max(0, modelConfidence));

  if (evidence.neighbourCount === 0) {
    return { level: "unsure", score: Math.min(c, UNSEEN_CEILING) };
  }
  const agrees = evidence.topNeighbourCategoryId === chosenCategoryId;
  if (evidence.topOverlap >= STRONG_OVERLAP && agrees) {
    return { level: "confirmed", score: Math.max(c, SETTLED_FLOOR) };
  }
  return { level: "likely", score: c };
}
