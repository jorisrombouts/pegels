import { descriptionTokens } from "@/lib/text/description-tokens";

/**
 * The corpus identity of a merchant.
 *
 * Used *identically* on both sides of retrieval — as the `dedupKey` a corpus row is stored under,
 * and as the text that gets embedded for both documents and queries. Any asymmetry between the two
 * silently destroys recall, which is why there is exactly one function.
 *
 * Note what is deliberately absent: the amount (a merchant string is ~4 tokens, so appending
 * "~1 000 kr" would cluster the vector space by magnitude instead of by merchant — amount is a
 * re-rank signal instead) and the category (queries have no category, and including it would make
 * every re-label invalidate the embedding). Because this depends only on the description,
 * `dedupKey` and `embedding` stay 1:1 and re-labelling never triggers a re-embed.
 */
export function normalizeMerchant(description: string): string {
  return descriptionTokens(description).join(" ");
}

/** The corpus is uniquely keyed on this — one row per merchant, not per correction. */
export const dedupKeyFor = normalizeMerchant;

/** Document and query text are the same function, by construction. */
export const embedTextFor = normalizeMerchant;
