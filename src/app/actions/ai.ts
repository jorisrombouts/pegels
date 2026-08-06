"use server";

import { getUserId } from "@/lib/auth";
import { getDataset, upsertTransaction } from "@/lib/db/queries";
import { matchesOwnAccount } from "@/lib/domain/own-account";
import { reconcileKindWithSign } from "@/lib/ai/reconcile";
import { applyRules, planRuleBackfill, selectRulesForBackfill } from "@/lib/rules";
import {
  PROMPT_VERSION,
  categorizeWithOpenAI,
  type AiNeighbour,
  type AiResult,
  type AiRow,
  type NeighboursByRow,
  type PromptTaxonomy,
} from "@/lib/ai/categorize-openai";
import { retrieveNeighbours } from "@/lib/ai/retrieve";
import { merchantTokens, tokenOverlap } from "@/lib/text/merchant-tokens";
import { clampConfidence } from "@/lib/ai/confidence";
import { stableHash } from "@/lib/ai/hash";


/**
 * Routing hint for OpenAI's prompt cache. It must change whenever the stable system message does,
 * or a request routes to a machine whose cached prefix no longer matches.
 */
function cacheKeyFor(userId: string, taxonomy: PromptTaxonomy): string {
  const signature = [
    ...taxonomy.categories.map((c) => `${c.id}=${c.name}`),
    ...taxonomy.tags.map((t) => `${t.id}=${t.name}`),
    PROMPT_VERSION,
  ]
    .sort()
    .join("|");
  return `cat:${userId}:${stableHash(signature)}`;
}

export async function categorizeTransactions(rows: AiRow[]): Promise<AiResult[]> {
  const userId = await getUserId();
  const data = await getDataset(userId);
  const taxonomy: PromptTaxonomy = {
    categories: data.categories.map((c) => ({ id: c.id, name: c.name })),
    tags: data.tags.map((t) => ({ id: t.id, name: t.name })),
  };
  const validIds = new Set(taxonomy.categories.map((c) => c.id));
  const categoryName = new Map(taxonomy.categories.map((c) => [c.id, c.name]));
  const tagName = new Map(taxonomy.tags.map((t) => [t.id, t.name]));

  // 1) deterministic: own-account transfers, then user rules
  const ownNumbers = data.accounts.map((a) => a.accountNumber).filter((n): n is string => !!n);
  const ruled = new Map<number, AiResult>();
  const ruleTags = new Map<number, string[]>(); // tags from a non-resolving rule, merged after the LLM
  const remaining: AiRow[] = [];
  for (const r of rows) {
    if (matchesOwnAccount(r.description, ownNumbers)) {
      ruled.set(r.index, { index: r.index, kind: "transfer", categoryId: null, confidence: 1, tagIds: [] });
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
        tagIds: outcome.addTagIds,
      });
    } else {
      if (outcome) ruleTags.set(r.index, outcome.addTagIds); // tag-only rule: still LLM-categorize, but keep tags
      remaining.push(r);
    }
  }

  // 2) retrieve confirmed examples, then classify. Retrieval failing must not fail the import —
  //    an empty neighbour map degrades to the model's own prior plus the priors in the prompt.
  let aiResults: AiResult[] = [];
  let neighbours: NeighboursByRow = new Map();
  if (remaining.length) {
    try {
      const retrieved = await retrieveNeighbours(userId, remaining);
      neighbours = new Map(
        [...retrieved].map(([index, list]) => [
          index,
          list.map(
            (n): AiNeighbour => ({
              id: n.id,
              description: n.cleanedDescription,
              kind: n.finalKind,
              categoryName: n.finalCategoryId ? categoryName.get(n.finalCategoryId) ?? null : null,
              tagNames: n.finalTagIds.map((id) => tagName.get(id)).filter((x): x is string => !!x),
              approved: n.approved,
            }),
          ),
        ]),
      );
    } catch (e) {
      console.error("retrieval failed; classifying without evidence", e);
    }

    // Deliberately no fallback. A hardcoded keyword table silently produced plausible-looking
    // categories whenever the API failed, which is how an expired API key went unnoticed for an
    // unknown number of imports. Failing loudly is the only way the user finds out.
    aiResults = await categorizeWithOpenAI(remaining, taxonomy, neighbours, cacheKeyFor(userId, taxonomy));
  }

  // 3) merge, defensively null out unknown categoryIds, and re-anchor confidence on the evidence
  const byIndex = new Map(rows.map((r) => [r.index, r]));
  const out: AiResult[] = [];
  for (const r of rows) {
    const res =
      ruled.get(r.index) ??
      aiResults.find((a) => a.index === r.index) ??
      ({ index: r.index, kind: r.amount < 0 ? "expense" : "income", categoryId: null, tagIds: [], confidence: 0.4 } as AiResult);
    reconcileKindWithSign(res, r.amount); // the data model forbids income<0 / expense>0; the sign wins
    if (res.categoryId && !validIds.has(res.categoryId)) res.categoryId = null;

    if (!ruled.has(r.index)) {
      const near = neighbours.get(r.index) ?? [];
      const top = near[0];
      const queryTokens = new Set(merchantTokens(byIndex.get(r.index)!.description));
      res.confidence = clampConfidence(
        res.confidence,
        {
          neighbourCount: near.length,
          topOverlap: top ? tokenOverlap(queryTokens, merchantTokens(top.description)) : 0,
          topNeighbourCategoryId: top ? categoryIdOf(top.categoryName, categoryName) : null,
        },
        res.categoryId,
      );
      // A tag-only rule still contributes its tags on top of whatever the model chose.
      const fromRule = ruleTags.get(r.index) ?? [];
      res.tagIds = [...new Set([...(res.tagIds ?? []), ...fromRule])];
    }
    out.push(res);
  }
  return out;
}

/** The prompt renders neighbours by category *name*; map back for the agreement check. */
function categoryIdOf(name: string | null, byId: Map<string, string>): string | null {
  if (!name) return null;
  for (const [id, n] of byId) if (n === name) return id;
  return null;
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
  for (const change of plan) {
    const tx = byId.get(change.id)!;
    await upsertTransaction(userId, { ...tx, ...change.patch, categorySource: "model" });
  }
  return plan.length;
}
