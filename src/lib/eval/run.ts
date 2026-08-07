import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/index";
import { categorizationExamples } from "@/lib/db/schema";
import { getDataset } from "@/lib/db/queries";
import { loadCorpus } from "@/lib/db/corpus-queries";
import { buildMaps } from "@/lib/domain/selectors";
import { merchantTokens, tokenOverlap } from "@/lib/text/merchant-tokens";
import { categorizeWithOpenAI, type AiNeighbour, type AiRow, type PromptTaxonomy } from "@/lib/ai/categorize-openai";
import { retrieveNeighbours } from "@/lib/ai/retrieve";
import { gradeConfidence } from "@/lib/ai/confidence";
import { evaluate, type GoldExample } from "./metrics";
import type { EvalMetrics, EvalMistake } from "./types";

/** Overlap at which a corpus merchant counts as "the same merchant" for the seen/unseen split. */
const SEEN_OVERLAP = 0.6;
/** Mistakes stored per run — enough to act on, not enough to bloat the row. */
const MAX_MISTAKES = 100;

export interface EvalRun {
  metrics: EvalMetrics;
  mistakes: EvalMistake[];
  corpusSize: number;
  goldSize: number;
}

/**
 * Score the live pipeline against the hold-out.
 *
 * Gold rows are excluded from retrieval by `corpusFilter`, so the model genuinely has to predict
 * them rather than look them up. Because the corpus is keyed one row per merchant, holding a
 * merchant out removes its only entry — which is why `seen` means "a lexically similar merchant
 * remains", not "this exact one".
 */
export async function runEval(userId: string, opts: { limit?: number } = {}): Promise<EvalRun> {
  const goldRows = await db
    .select()
    .from(categorizationExamples)
    .where(and(eq(categorizationExamples.userId, userId), eq(categorizationExamples.gold, true)))
    .limit(opts.limit ?? 500);

  const data = await getDataset(userId);
  const maps = buildMaps(data.categories);
  const taxonomy: PromptTaxonomy = {
    categories: data.categories.map((c) => ({ id: c.id, name: c.name })),
    tags: data.tags.map((t) => ({ id: t.id, name: t.name })),
  };
  const categoryName = new Map(taxonomy.categories.map((c) => [c.id, c.name]));
  const tagName = new Map(taxonomy.tags.map((t) => [t.id, t.name]));

  // The retrievable corpus, minus gold — this is what decides seen vs unseen.
  const corpus = await loadCorpus(userId, { includeCandidates: false });
  const corpusTokens = corpus.map((c) => merchantTokens(c.cleanedDescription));

  const gold: GoldExample[] = goldRows.map((g) => {
    const tokens = new Set(merchantTokens(g.cleanedDescription));
    return {
      description: g.cleanedDescription,
      amount: Number(g.amount),
      finalKind: g.finalKind,
      finalCategoryId: g.finalCategoryId,
      finalTagIds: g.finalTagIds ?? [],
      seen: corpusTokens.some((t) => tokenOverlap(tokens, t) >= SEEN_OVERLAP),
    };
  });

  const rows: AiRow[] = gold.map((g, index) => ({ index, description: g.description, amount: g.amount }));
  if (!rows.length) {
    return { metrics: evaluate([], [], maps), mistakes: [], corpusSize: corpus.length, goldSize: 0 };
  }

  const retrieved = await retrieveNeighbours(userId, rows);
  const neighbours = new Map(
    [...retrieved].map(([index, list]) => [
      index,
      list.map((n): AiNeighbour => ({
        id: n.id,
        description: n.cleanedDescription,
        kind: n.finalKind,
        categoryName: n.finalCategoryId ? categoryName.get(n.finalCategoryId) ?? null : null,
        tagNames: n.finalTagIds.map((id) => tagName.get(id)).filter((x): x is string => !!x),
        approved: n.approved,
      })),
    ]),
  );

  const predictions = await categorizeWithOpenAI(rows, taxonomy, neighbours);

  // Apply the same confidence clamp the real path does, or reviewPrecision measures the wrong thing.
  for (const p of predictions) {
    const near = neighbours.get(p.index) ?? [];
    const top = near[0];
    const queryTokens = new Set(merchantTokens(rows[p.index]?.description ?? ""));
    const graded = gradeConfidence(
      p.confidence,
      {
        neighbourCount: near.length,
        topOverlap: top ? tokenOverlap(queryTokens, merchantTokens(top.description)) : 0,
        topNeighbourCategoryId: top?.categoryName
          ? taxonomy.categories.find((c) => c.name === top.categoryName)?.id ?? null
          : null,
      },
      p.categoryId,
    );
    p.confidence = graded.score;
    p.level = graded.level;
  }

  const metrics = evaluate(gold, predictions, maps);

  const byIndex = new Map(predictions.map((p) => [p.index, p]));
  const mistakes: EvalMistake[] = [];
  gold.forEach((g, i) => {
    const p = byIndex.get(i);
    if (p && p.kind === g.finalKind && p.categoryId === g.finalCategoryId) return;
    if (mistakes.length >= MAX_MISTAKES) return;
    mistakes.push({
      description: g.description,
      amount: g.amount,
      expectedKind: g.finalKind,
      actualKind: p?.kind ?? "(none)",
      expectedCategoryId: g.finalCategoryId,
      actualCategoryId: p?.categoryId ?? null,
      expectedTagIds: g.finalTagIds,
      actualTagIds: p?.tagIds ?? [],
      confidence: p?.confidence ?? 0,
      seen: g.seen,
    });
  });

  return { metrics, mistakes, corpusSize: corpus.length, goldSize: gold.length };
}
