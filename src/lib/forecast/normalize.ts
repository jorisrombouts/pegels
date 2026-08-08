import { descriptionTokens } from "@/lib/text/description-tokens";

/**
 * FORECAST-ONLY grouping key. Collapses the same repeat charge across months so it can be
 * read as a time series.
 *
 * Deliberately NOT the same key as categorization's `normalizeMerchant`: this one truncates, so
 * "HYRA MARS" and "HYRA APRIL" are one bill while two ICA stores stay two merchants over there.
 * It never influences a label, only whether a charge looks recurring — categorization retrieves
 * its own neighbours and must not gain a merchant-keyed memory by the back door. Only the shared
 * *cleaning* is common; the keys differ by design.
 */

/** Swedish bank descriptions lead with the merchant and trail the variable part. */
const KEEP_TOKENS = 3;

export function recurringKey(description: string): string {
  return descriptionTokens(description).slice(0, KEEP_TOKENS).join(" ");
}
