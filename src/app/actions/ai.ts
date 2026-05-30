"use server";

import { getUserId } from "@/lib/auth";
import { getDataset } from "@/lib/db/queries";
import { classifyRules, categorize } from "@/lib/categorize";
import { categorizeWithOpenAI, type AiResult, type AiRow } from "@/lib/ai/categorize-openai";

export async function categorizeTransactions(rows: AiRow[]): Promise<AiResult[]> {
  const userId = await getUserId();
  const data = await getDataset(userId);
  const categories = data.categories.map((c) => ({ id: c.id, name: c.name }));
  const validIds = new Set(categories.map((c) => c.id));

  // 1) deterministic rules first
  const ruled = new Map<number, AiResult>();
  const remaining: AiRow[] = [];
  for (const r of rows) {
    const rule = classifyRules(r.description);
    if (rule) ruled.set(r.index, { index: r.index, kind: rule.kind, categoryId: rule.categoryId, confidence: 1 });
    else remaining.push(r);
  }

  // 2) OpenAI for the rest; on any failure, fall back to keyword categorize + sign-based kind
  let aiResults: AiResult[] = [];
  if (remaining.length) {
    try {
      aiResults = await categorizeWithOpenAI(remaining, categories /*, examples added in P5 */);
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
    out.push(res);
  }
  return out;
}
