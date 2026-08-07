import type { ConfidenceLevel } from "@/lib/ai/confidence";

/**
 * Kept only to anchor the retained score, which the eval uses for calibration. Nothing the user
 * sees is decided by it any more.
 */
export const REVIEW_THRESHOLD = 0.6;

/**
 * A row needs a human when the system has never seen the merchant.
 *
 * This used to be `confidence < 0.6`, which read as "the model felt unsure" — a number the model
 * invents and which the hold-out shows is uncorrelated with being right. "No evidence" is a fact,
 * and it is the thing actually worth a minute of attention.
 */
export function needsReview(level: ConfidenceLevel): boolean {
  return level === "unsure";
}
