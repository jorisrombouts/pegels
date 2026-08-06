/** A prediction needs manual review when the model isn't confident. */
export const REVIEW_THRESHOLD = 0.6;

export function needsReview(confidence: number): boolean {
  return confidence < REVIEW_THRESHOLD;
}
