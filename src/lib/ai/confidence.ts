import { REVIEW_THRESHOLD } from "@/lib/domain/review";

/**
 * How much a categorization is worth trusting.
 *
 * Three named levels rather than a percentage. The model's self-reported number is uncalibrated —
 * measured against the hold-out, its mean on correct answers (0.58) and on wrong ones (0.53) are
 * indistinguishable — so "58%" claimed a precision that does not exist.
 *
 * These read as a magnitude scale, which is the familiar shape, but they are **not** the model's
 * opinion of itself. Each one is decided by facts we control: whether retrieval found this
 * merchant, how closely, and whether the model agreed with it. The UI carries the reason alongside
 * the label so the word is never the whole story.
 */
export type ConfidenceLevel = "low" | "medium" | "high";

/** Least to most certain, so a UI can rank or compare them. */
export const CONFIDENCE_LEVELS: ConfidenceLevel[] = ["low", "medium", "high"];

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
   * with it — if it ever separates right from wrong answers, that is worth knowing. Not shown.
   */
  score: number;
}

/**
 * Grade a prediction against what retrieval actually found.
 *
 *  - **low** — nothing retrieved. The system has never seen this merchant, which is precisely what
 *    deserves a human, and what makes cold start self-healing: these surface, get corrected, and
 *    become evidence. A confident-sounding model cannot talk its way out of this.
 *  - **high** — a near-identical merchant in the approved corpus agrees with the answer.
 *  - **medium** — everything else: there was evidence, but nothing that settles it.
 */
export function gradeConfidence(
  modelConfidence: number,
  evidence: RetrievalEvidence,
  chosenCategoryId: string | null,
): Confidence {
  const c = Math.min(1, Math.max(0, modelConfidence));

  if (evidence.neighbourCount === 0) {
    return { level: "low", score: Math.min(c, UNSEEN_CEILING) };
  }
  const agrees = evidence.topNeighbourCategoryId === chosenCategoryId;
  if (evidence.topOverlap >= STRONG_OVERLAP && agrees) {
    return { level: "high", score: Math.max(c, SETTLED_FLOOR) };
  }
  return { level: "medium", score: c };
}
