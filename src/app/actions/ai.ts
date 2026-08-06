"use server";

import { getUserId } from "@/lib/auth";
import {
  getDataset,
  insertCategorizationExamples,
  recentCategorizationExamples,
  affirmedExamples,
  upsertTransactions,
} from "@/lib/db/queries";
import { categorize, matchesOwnAccount } from "@/lib/categorize";
import { applyRules, planRuleBackfill, selectRulesForBackfill } from "@/lib/rules";
import { categorizeWithOpenAI, type AiExample, type AiResult, type AiRow } from "@/lib/ai/categorize-openai";
import { selectExamples } from "@/lib/ai/select-examples";
import type { TransactionKind } from "@/lib/domain/types";

interface CorrectionInput {
  rawDescription: string;
  cleanedDescription: string;
  amount: number;
  predictedKind: TransactionKind | null;
  predictedCategoryId: string | null;
  predictedConfidence: number | null;
  finalKind: TransactionKind;
  finalCategoryId: string | null;
}

export async function categorizeTransactions(rows: AiRow[]): Promise<AiResult[]> {
  const userId = await getUserId();
  const data = await getDataset(userId);
  const categories = data.categories.map((c) => ({ id: c.id, name: c.name }));
  const validIds = new Set(categories.map((c) => c.id));

  // Feedback loop: build the few-shot from the user's past corrections (high-signal), with recent
  // rows as a cold-start top-up. The relevance-matched selection happens once `remaining` is known.
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const [affirmed, recent] = await Promise.all([
    affirmedExamples(userId, 60),
    recentCategorizationExamples(userId, 40),
  ]);

  // 1) deterministic: own-account transfers, then user rules
  const ownNumbers = data.accounts.map((a) => a.accountNumber).filter((n): n is string => !!n);
  const ruled = new Map<number, AiResult>();
  const ruleTags = new Map<number, string[]>(); // tags from a non-resolving rule, merged after the LLM
  const remaining: AiRow[] = [];
  for (const r of rows) {
    if (matchesOwnAccount(r.description, ownNumbers)) {
      ruled.set(r.index, { index: r.index, kind: "transfer", categoryId: null, confidence: 1, addTagIds: [] });
      continue;
    }
    const outcome = applyRules(r.description, data.rules);
    const resolves = outcome && (outcome.categoryId != null || outcome.kind === "income" || outcome.kind === "transfer");
    if (outcome && resolves) {
      ruled.set(r.index, {
        index: r.index,
        kind: outcome.kind ?? (r.amount < 0 ? "expense" : "income"),
        categoryId: outcome.categoryId ?? null,
        confidence: 1,
        addTagIds: outcome.addTagIds,
      });
    } else {
      if (outcome) ruleTags.set(r.index, outcome.addTagIds); // tag-only rule: still LLM-categorize, but keep tags
      remaining.push(r);
    }
  }

  // 2) OpenAI for the rest; on any failure, fall back to keyword categorize + sign-based kind
  let aiResults: AiResult[] = [];
  if (remaining.length) {
    const exampleList: AiExample[] = selectExamples({ rows: remaining, corrected: affirmed, recent }).map((e) => ({
      description: e.cleanedDescription,
      kind: e.finalKind,
      categoryName: e.finalCategoryId ? categoryName.get(e.finalCategoryId) ?? null : null,
    }));
    try {
      aiResults = await categorizeWithOpenAI(remaining, categories, exampleList, `cat:${userId}`);
    } catch {
      aiResults = remaining.map((r) => {
        const g = categorize(r.description);
        return { index: r.index, kind: r.amount < 0 ? "expense" : "income", categoryId: g.categoryId, confidence: g.confidence } as AiResult;
      });
    }
  }

  // 3) merge, defensively null out unknown categoryIds
  const out: AiResult[] = [];
  for (const r of rows) {
    const res =
      ruled.get(r.index) ??
      aiResults.find((a) => a.index === r.index) ??
      ({ index: r.index, kind: r.amount < 0 ? "expense" : "income", categoryId: null, confidence: 0.4 } as AiResult);
    reconcileKindWithSign(res, r.amount); // the data model forbids income<0 / expense>0; the sign wins
    if (res.categoryId && !validIds.has(res.categoryId)) res.categoryId = null;
    if (!ruled.has(r.index)) res.addTagIds = ruleTags.get(r.index) ?? [];
    out.push(res);
  }
  return out;
}

/**
 * Enforce the sign convention (negative = expense, positive = income) the LLM can violate.
 * Transfers move in either direction, so they're left untouched; a kind flipped to a non-expense
 * also drops its category (only expenses carry one).
 */
function reconcileKindWithSign(res: AiResult, amount: number): void {
  if (res.kind === "transfer" || amount === 0) return;
  const expected: TransactionKind = amount < 0 ? "expense" : "income";
  if (res.kind !== expected) {
    res.kind = expected;
    if (expected !== "expense") res.categoryId = null;
  }
}

export async function previewRuleBackfill(ruleId?: string): Promise<{ count: number; samples: { description: string }[] }> {
  const userId = await getUserId();
  const data = await getDataset(userId);
  const plan = planRuleBackfill(data.transactions, selectRulesForBackfill(data.rules, ruleId));
  return { count: plan.length, samples: plan.slice(0, 8).map((p) => ({ description: p.description })) };
}

export async function applyRuleBackfill(ruleId?: string): Promise<number> {
  const userId = await getUserId();
  const data = await getDataset(userId);
  const plan = planRuleBackfill(data.transactions, selectRulesForBackfill(data.rules, ruleId));
  const byId = new Map(data.transactions.map((t) => [t.id, t]));
  await upsertTransactions(userId, plan.map((c) => ({ ...byId.get(c.id)!, ...c.patch, categorySource: "model" as const })));
  return plan.length;
}

function toExampleRow(ex: CorrectionInput, source: "import" | "detail", corrected: boolean) {
  return {
    id: `ex-${crypto.randomUUID()}`,
    rawDescription: ex.rawDescription,
    cleanedDescription: ex.cleanedDescription,
    amount: String(ex.amount),
    predictedKind: ex.predictedKind,
    predictedCategoryId: ex.predictedCategoryId,
    predictedConfidence: ex.predictedConfidence,
    finalKind: ex.finalKind,
    finalCategoryId: ex.finalCategoryId,
    corrected,
    source,
    createdAt: new Date().toISOString(),
  };
}

/** Log every imported row: predicted = the AI's original guess, final = what the user kept/edited. */
export async function logImportExamples(rows: CorrectionInput[]): Promise<void> {
  if (!rows.length) return;
  const examples = rows.map((ex) => {
    const corrected = ex.predictedKind !== ex.finalKind || ex.predictedCategoryId !== ex.finalCategoryId;
    return toExampleRow(ex, "import", corrected);
  });
  await insertCategorizationExamples(await getUserId(), examples);
}

/** Log a single detail-panel correction (always corrected). */
export async function logDetailCorrection(ex: CorrectionInput): Promise<void> {
  await insertCategorizationExamples(await getUserId(), [toExampleRow(ex, "detail", true)]);
}

/** Log a detail-panel approval: the user confirmed the AI's guess (final == predicted). Not a
 *  correction, but still an explicit affirmation — it feeds the few-shot via affirmedExamples. */
export async function logDetailApproval(ex: CorrectionInput): Promise<void> {
  await insertCategorizationExamples(await getUserId(), [toExampleRow(ex, "detail", false)]);
}
