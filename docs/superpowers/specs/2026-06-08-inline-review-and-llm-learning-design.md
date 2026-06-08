# Inline review + sharper LLM categorization

**Date:** 2026-06-08
**Status:** Approved

## Problem

Two gaps in the categorization loop:

1. **Reviewing is hidden.** A low-confidence prediction sets `needsReview`, shown as a small dot, but
   the only way to fix it is: Transactions → "Needs review" filter → open the detail → change category.
   Easy to miss; feels like there's no way to act on flagged rows.
2. **Learning is crude.** `categorizeTransactions` already feeds the LLM the 40 *most-recent* logged
   categorizations — corrected or not. Passive logs (the AI agreeing with itself) dilute the real
   signal, and recency ignores relevance, so a new "ICA MAXI STORGATAN" doesn't benefit from your past
   "ICA" corrections.

## Decision

- **Inline correct** flagged rows directly in the Transactions list.
- **Sharpen the LLM few-shot** to use your actual corrections, relevance-matched to the batch.
- Explicitly **not** auto-creating rules from repeats (deferred at user request).

## Part 1 — Inline review & correct

A needs-review row in the Transactions list shows an inline category `Select` in place of the static
chip. Choosing a category:

- optimistically sets `categoryId` + `categorySource: "user"` and clears `needsReview`,
- logs the correction via the existing `logDetailCorrection` action (feeding Part 2).

`TransactionRow` is refactored so the category slot is independently interactive: the row's date /
description / amount area still opens the detail panel (a `<button>`), while the category slot is a
sibling — a `Select` for needs-review rows, the existing `CategoryChip` otherwise (no nested
interactive elements). The Transactions page passes `onCorrect(id, categoryId)` and the ordered
category list to the row; `onCorrect` runs `updateTransaction` + builds the `CorrectionInput` and
calls `logDetailCorrection` (same shape the detail panel already uses).

Scope: inline picker on **needs-review rows only**. Non-review rows are unchanged.

## Part 2 — Sharper LLM inference (no rules)

- **Query:** new `correctedExamples(userId, limit)` returns only `corrected = true` rows
  (`cleanedDescription`, `finalKind`, `finalCategoryId`), newest first. The existing
  `recentCategorizationExamples` stays as the cold-start fallback.
- **Pure selection** `selectExamples({ rows, corrected, recent, limit })` in `src/lib/ai/select-examples.ts`:
  1. `merchantTokens(desc)` — lowercased word tokens, length ≥ 3, drop pure-numeric, for matching.
  2. **Relevance bias:** corrected examples whose tokens overlap any batch row come first.
  3. Then the remaining corrected examples, then `recent` (cold-start top-up).
  4. **Dedupe** by `cleanedDescription.toLowerCase() | finalKind | finalCategoryId`, keeping the
     first (newest). Exact-description (not token-collapsed) so distinct merchant variants both inform.
  5. **Cap** at `limit` (40).
  Returns example rows; the action maps `finalCategoryId → categoryName` into `AiExample`.
- **`categorizeTransactions`** fetches `correctedExamples` + `recentCategorizationExamples`, runs
  `selectExamples` against the rows it's about to classify, and passes the result as the few-shot.
- **Prompt framing** in `buildMessages`: present the block as corrections the user explicitly made and
  to prefer them over the model's prior.

**Tradeoff:** relevance-varying examples reduce OpenAI prompt-cache reuse vs. a static block; for a
personal app, accuracy wins. Selection is per `categorizeTransactions` call (stable across its chunks).

## Testing

- `merchantTokens`: tokenization (case, length floor, numeric drop).
- `selectExamples`: relevance ordering, dedupe, cap, cold-start fallback to `recent`, empty inputs.
- Parser/query are thin; `buildMessages` framing asserted by a string check.
- Inline correct reuses the already-tested `logDetailCorrection` path.

## Out of scope (YAGNI / deferred)

Auto-creating or suggesting rules from repeated corrections; embeddings/vector retrieval (token
overlap is enough at personal scale); changing what gets logged (all imports still logged; only the
*selection* changes).
