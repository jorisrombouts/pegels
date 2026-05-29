/**
 * Pegels domain model (PRD §5). All amounts are SEK.
 * Negative `amount` = expense, positive = income/transfer-in.
 */

export type AccountKind = "spending" | "savings";

export interface Account {
  id: string;
  name: string;
  /** Display label, e.g. "Checking", "Revolut", "Savings". */
  type: string;
  /** Drives spending math: `savings` accounts never count toward expenses. */
  kind: AccountKind;
  icon: string; // emoji
  color: string; // hsl triplet "h s% l%"
  /** Current balance in SEK (UI-first; a backend would derive this). */
  balance: number;
  archived: boolean;
}

export interface Category {
  id: string;
  name: string;
  icon: string; // emoji
  color: string; // hsl triplet
  /** null for top-level categories. */
  parentId: string | null;
}

export interface Tag {
  id: string;
  name: string;
  color: string; // hsl triplet
}

/** A portion of a transaction; only `mine` portions count toward expenses. */
export interface Split {
  id: string;
  label?: string;
  amount: number; // absolute SEK of this portion
  mine: boolean;
}

export type CategorySource = "model" | "user";

export type TransactionKind = "expense" | "income" | "transfer";

export interface Transaction {
  id: string;
  date: string; // ISO yyyy-mm-dd
  description: string; // Swedish, e.g. "ICA Maxi Haninge"
  amount: number; // SEK; negative = expense
  accountId: string;
  categoryId: string | null;
  predictedCategoryId: string | null;
  /** Model confidence 0..1 for the predicted category. */
  categoryConfidence: number | null;
  /** "model" = AI-assigned, "user" = manually corrected. */
  categorySource: CategorySource;
  needsReview: boolean;
  tagIds: string[];
  splits?: Split[];
  notes?: string;
  /** What this money event is. Drives counting + visibility. */
  kind: TransactionKind;
  /** Goal this transfer funds (only when kind === "transfer"). */
  goalId: string | null;
}

export interface Budget {
  id: string;
  /** Targets a top-level OR sub category. */
  categoryId: string;
  limit: number; // positive SEK monthly cap
  /** "yyyy-mm" for a one-off month, or null when it repeats every month. */
  month: string | null;
}

export interface GoalContribution {
  id: string;
  date: string; // ISO
  amount: number; // positive SEK
}

export interface Goal {
  id: string;
  name: string;
  icon: string; // emoji
  target: number;
  /** Baseline already put aside before contributions were logged. */
  baseline: number;
  deadline: string | null; // ISO date
  /** Optional linked savings account. */
  accountId: string | null;
  contributions: GoalContribution[];
}
