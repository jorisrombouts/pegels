/**
 * Mock auto-categorizer (stand-in for the future OpenAI step). Maps a Swedish
 * transaction description to a category id + a confidence 0..1 by keyword match.
 */

import type { TransactionKind } from "@/lib/domain/types";

export interface CategoryGuess {
  categoryId: string | null;
  confidence: number;
}

export interface RuleClassification {
  kind: TransactionKind;
  categoryId: string | null;
}

/** High-certainty Swedish-bank rules; returns null if no rule applies. Case-insensitive. */
export function classifyRules(description: string): RuleClassification | null {
  const d = description.toUpperCase();
  if (d.includes("REVOLUT")) return { kind: "transfer", categoryId: null };
  if (d.includes("SEB KORT")) return { kind: "transfer", categoryId: null };
  if (d.includes("AMERICAN EXPRESS") || d.includes("AMEX")) return { kind: "transfer", categoryId: null };
  if (d.includes("AVANZA")) return { kind: "transfer", categoryId: null }; // savings/investments
  if (/\bLÖN\b/.test(d)) return { kind: "income", categoryId: null }; // salary
  if (d.includes("LÅN")) return { kind: "expense", categoryId: "cat-mortgage" }; // bolån
  return null;
}

/**
 * True when the description references one of the user's own bank account numbers
 * (a transfer between own accounts). Spaces are ignored on both sides so
 * "9988 7766554" matches "99887766554".
 */
export function matchesOwnAccount(description: string, ownNumbers: string[]): boolean {
  const d = description.replace(/\s/g, "");
  return ownNumbers.some((n) => {
    const num = n.replace(/\s/g, "");
    return num.length > 0 && d.includes(num);
  });
}

const RULES: { keywords: string[]; categoryId: string; confidence: number }[] = [
  { keywords: ["ica", "hemköp", "coop", "willys", "lidl", "konsum"], categoryId: "cat-groceries", confidence: 0.93 },
  { keywords: ["spotify", "netflix", "hbo", "disney", "icloud", "youtube", "prenumeration"], categoryId: "cat-entertainment", confidence: 0.96 },
  { keywords: ["sl ", "månadskort", "sl månadskort"], categoryId: "cat-transit", confidence: 0.97 },
  { keywords: ["hyra"], categoryId: "cat-rent", confidence: 0.97 },
  { keywords: ["vattenfall", "elräkning", "ellevio", "fortum"], categoryId: "cat-electricity", confidence: 0.95 },
  { keywords: ["klarna", "h&m", "zalando", "lindex", "nelly"], categoryId: "cat-clothing", confidence: 0.85 },
  { keywords: ["apotek", "apoteket", "tandläkare", "vårdcentral"], categoryId: "cat-health", confidence: 0.9 },
  { keywords: ["okq8", "bensin", "circle k", "preem", "st1"], categoryId: "cat-fuel", confidence: 0.9 },
  { keywords: ["restaurang", "pelikan", "max", "mcdonald", "burger", "pizzeria"], categoryId: "cat-restaurants", confidence: 0.8 },
  { keywords: ["café", "espresso", "fika", "kaffe", "barista", "espresso house", "wayne"], categoryId: "cat-cafe", confidence: 0.8 },
  { keywords: ["ikea", "jysk", "clas ohlson", "rusta", "mio", "em home"], categoryId: "cat-home", confidence: 0.85 },
  { keywords: ["uber", "bolt", "taxi"], categoryId: "cat-transport", confidence: 0.82 },
  { keywords: ["filmstaden", "sf bio", "bio"], categoryId: "cat-entertainment", confidence: 0.84 },
  { keywords: ["swish"], categoryId: "cat-restaurants", confidence: 0.42 },
  { keywords: ["pressbyrån", "7-eleven", "systembolaget"], categoryId: "cat-food", confidence: 0.55 },
];

export function categorize(description: string): CategoryGuess {
  const d = description.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((k) => d.includes(k))) {
      return { categoryId: rule.categoryId, confidence: rule.confidence };
    }
  }
  // Unknown → "Other" with low confidence (flags needsReview).
  return { categoryId: "cat-other", confidence: 0.4 };
}

/** A guess needs manual review when the model isn't confident. */
export function needsReview(confidence: number): boolean {
  return confidence < 0.6;
}
