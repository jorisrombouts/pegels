"use server";

import { getUserId } from "@/lib/auth";
import {
  getDataset,
  insertCategorizationExamples,
  recentCategorizationExamples,
} from "@/lib/db/queries";
import { categorize, matchesOwnAccount } from "@/lib/categorize";
import { applyRules } from "@/lib/rules";
import { categorizeWithOpenAI, type AiExample, type AiResult, type AiRow } from "@/lib/ai/categorize-openai";
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

  // Feedback loop: feed the user's recent categorizations back as few-shot examples.
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const recent = await recentCategorizationExamples(userId, 40);
  const exampleList: AiExample[] = recent.map((e) => ({
    description: e.cleanedDescription,
    kind: e.finalKind,
    categoryName: e.finalCategoryId ? categoryName.get(e.finalCategoryId) ?? null : null,
  }));

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
    if (res.categoryId && !validIds.has(res.categoryId)) res.categoryId = null;
    if (!ruled.has(r.index)) res.addTagIds = ruleTags.get(r.index) ?? [];
    out.push(res);
  }
  return out;
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
