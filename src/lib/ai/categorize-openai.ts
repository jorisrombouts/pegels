import OpenAI from "openai";
import type { TransactionKind } from "@/lib/domain/types";

/** Bump when the prompt template changes — it feeds the cache key so a stale prefix isn't reused. */
export const PROMPT_VERSION = "2";

export interface AiRow {
  index: number;
  description: string;
  amount: number;
}
export interface AiCategory {
  id: string;
  name: string;
}
export interface AiTag {
  id: string;
  name: string;
}
/** Everything the stable system message needs. Changing it is what invalidates the cached prefix. */
export interface PromptTaxonomy {
  categories: AiCategory[];
  tags: AiTag[];
}
/** A retrieved corpus example, as the prompt renders it. */
export interface AiNeighbour {
  id: string;
  description: string;
  kind: TransactionKind;
  categoryName: string | null;
  tagNames: string[];
  /** false = an unreviewed candidate, rendered as weaker evidence. */
  approved: boolean;
}
export interface AiResult {
  index: number;
  kind: TransactionKind;
  categoryId: string | null;
  tagIds: string[];
  confidence: number;
}

/** Row index → its retrieved neighbours, best first. */
export type NeighboursByRow = Map<number, AiNeighbour[]>;

/**
 * Domain knowledge that used to live in the rules table and the keyword map.
 *
 * This is not the rules engine returning: it is instruction text inside the cached prefix, so it
 * costs almost nothing after the first call, and — unlike `String.includes` — the model generalises
 * from "ICA" to ICA Nära, ICA Kvantum, ICA Supermarket. Crucially it is overridable: a confirmed
 * example always wins, so the corpus can correct any prior here.
 */
const PRIORS = [
  "Salary lines (LÖN, LÖNEUTBET, LÖNEUTBETALNING) are income.",
  "Card-bill payments and top-ups are transfers: SEB Kort, American Express / Amex, Revolut, Avanza.",
  "Lines containing lån, bolån or amortering are the mortgage — an expense, not a transfer.",
  "Common Swedish merchants: ICA / Coop / Hemköp / Willys / Lidl are groceries; SL is public transit;",
  "  Apoteket and Apotek Hjärtat are health; OKQ8 / Circle K / Preem / St1 are fuel;",
  "  Systembolaget is alcohol; Klarna is the underlying purchase, not a transfer.",
].join("\n");

/**
 * Build the two messages.
 *
 * The split is load-bearing for cost. Message 0 is **100% stable per user** — instructions, priors,
 * the full category and tag lists, the output contract — so it forms an exact cacheable prefix and
 * only changes when the taxonomy does. Everything that varies per batch (the retrieved evidence and
 * the rows) lives in message 1. A test asserts message 0 is byte-identical across different
 * neighbour sets, because this is the kind of thing that regresses silently.
 */
export function buildMessages(rows: AiRow[], taxonomy: PromptTaxonomy, neighbours: NeighboursByRow) {
  const system = [
    "You categorize Swedish bank transactions. For each row classify it into a kind and, for",
    "expenses, the best-fit category and any tags that clearly apply.",
    "",
    "The amount sign is authoritative: a negative amount is money leaving the account, a positive",
    "amount is money coming in. Never label a negative amount as income, and never label a positive",
    "amount as expense.",
    "",
    "kind is one of:",
    "- income: money coming in (amount is positive).",
    "- transfer: movement between the user's own accounts, card-bill payments, and top-ups.",
    "  Transfers have categoryId null.",
    "- expense: everything the user actually buys (amount is negative).",
    "",
    "Set categoryId to null when no category fits or when the kind is income or transfer.",
    "Use tagIds only for tags that clearly apply; an empty list is the right answer most of the time.",
    "",
    "confidence is the probability the user would pick this categoryId:",
    "- 0.9 or above when a confirmed example below matches this row's merchant.",
    "- 0.6 or below when you are inferring from the merchant name alone.",
    "- 0.4 or below when the description is opaque (a bare Swish reference, a raw account number).",
    "",
    "Useful priors — if a confirmed example contradicts one of these, the example wins:",
    PRIORS,
    "",
    "Categories (id = name):",
    taxonomy.categories.map((c) => `${c.id} = ${c.name}`).join("\n"),
    "",
    "Tags (id = name):",
    taxonomy.tags.length ? taxonomy.tags.map((t) => `${t.id} = ${t.name}`).join("\n") : "(none defined)",
  ].join("\n");

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: buildUserMessage(rows, neighbours) },
  ];
}

/**
 * Evidence table plus rows.
 *
 * Inlining each row's neighbours would repeat the same merchants dozens of times — 6 neighbours ×
 * 40 rows is ~3 600 tokens of mostly duplicate text. Instead the chunk's neighbours are pooled into
 * one deduplicated table and each row points at the ids that apply to it. Per-row precision is
 * preserved exactly, at a fraction of the tokens.
 */
function buildUserMessage(rows: AiRow[], neighbours: NeighboursByRow): string {
  const idOf = new Map<string, string>(); // corpus id → evidence label (E1, E2, …)
  const approved: string[] = [];
  const unconfirmed: string[] = [];

  for (const row of rows) {
    for (const n of neighbours.get(row.index) ?? []) {
      if (idOf.has(n.id)) continue;
      const label = `E${idOf.size + 1}`;
      idOf.set(n.id, label);
      const tags = n.tagNames.length ? ` · [${n.tagNames.join(", ")}]` : "";
      const line = `${label}  ${n.description} → ${n.kind} · ${n.categoryName ?? "no category"}${tags}`;
      (n.approved ? approved : unconfirmed).push(line);
    }
  }

  const sections: string[] = [];
  if (approved.length) {
    sections.push(
      "CONFIRMED EXAMPLES — the user approved these. Prefer them over your own prior when a row resembles one.",
      approved.join("\n"),
      "",
    );
  }
  if (unconfirmed.length) {
    sections.push(
      "UNCONFIRMED EXAMPLES — the user has not reviewed these; treat as weaker evidence.",
      unconfirmed.join("\n"),
      "",
    );
  }

  const header = idOf.size
    ? "ROWS TO CLASSIFY — index | amount | description | closest confirmed examples"
    : "ROWS TO CLASSIFY — index | amount | description";
  const lines = rows.map((r) => {
    const labels = (neighbours.get(r.index) ?? []).map((n) => idOf.get(n.id)!).join(", ");
    const base = `${r.index} | ${r.amount} | ${r.description}`;
    return idOf.size ? `${base} | ${labels}` : base;
  });

  return [...sections, header, lines.join("\n")].join("\n");
}

const CHUNK_SIZE = 40;

const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "categorizations",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["results"],
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["index", "kind", "categoryId", "tagIds", "confidence"],
            properties: {
              index: { type: "integer" },
              kind: { type: "string", enum: ["expense", "income", "transfer"] },
              // Left as string|null rather than a dynamic enum — the post-filter below already
              // handles hallucinated ids and is proven.
              categoryId: { type: ["string", "null"] },
              tagIds: { type: "array", items: { type: "string" } },
              confidence: { type: "number" },
            },
          },
        },
      },
    },
  },
} as const;

async function categorizeChunk(
  client: OpenAI,
  rows: AiRow[],
  taxonomy: PromptTaxonomy,
  neighbours: NeighboursByRow,
  cacheKey?: string,
): Promise<AiResult[]> {
  const params = {
    model: "gpt-4o-mini",
    messages: buildMessages(rows, taxonomy, neighbours),
    // Categorization is a classification task, not a creative one. Left unset this defaults to 1,
    // which means every run samples and a settled merchant can flip between imports.
    temperature: 0,
    response_format: RESPONSE_FORMAT,
    ...(cacheKey ? { prompt_cache_key: cacheKey, prompt_cache_retention: "24h" } : {}),
  } as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;

  const completion = await client.chat.completions.create(params);
  const content = completion.choices[0].message.content ?? "{}";
  const parsed = JSON.parse(content) as { results?: Partial<AiResult>[] };
  return (parsed.results ?? []) as AiResult[];
}

export async function categorizeWithOpenAI(
  rows: AiRow[],
  taxonomy: PromptTaxonomy,
  neighbours: NeighboursByRow,
  cacheKey?: string,
): Promise<AiResult[]> {
  const client = new OpenAI();

  const chunks: AiRow[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) chunks.push(rows.slice(i, i + CHUNK_SIZE));

  const settled = await Promise.allSettled(
    chunks.map((chunk) => categorizeChunk(client, chunk, taxonomy, neighbours, cacheKey)),
  );

  const fulfilled = settled.filter((s): s is PromiseFulfilledResult<AiResult[]> => s.status === "fulfilled");
  if (fulfilled.length === 0 && rows.length > 0) throw new Error("All categorization chunks failed");

  const merged = ([] as AiResult[]).concat(...fulfilled.map((s) => s.value));
  const validCategories = new Set(taxonomy.categories.map((c) => c.id));
  const validTags = new Set(taxonomy.tags.map((t) => t.id));

  return merged.map((r) => ({
    index: r.index,
    kind: r.kind,
    categoryId: r.categoryId && validCategories.has(r.categoryId) ? r.categoryId : null,
    tagIds: (r.tagIds ?? []).filter((id) => validTags.has(id)),
    confidence: Math.min(1, Math.max(0, r.confidence)),
  }));
}
