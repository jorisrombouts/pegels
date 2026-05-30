import OpenAI from "openai";
import type { TransactionKind } from "@/lib/domain/types";

export interface AiRow {
  index: number;
  description: string;
  amount: number;
}
export interface AiCategory {
  id: string;
  name: string;
}
export interface AiExample {
  description: string;
  kind: TransactionKind;
  categoryName: string | null;
}
export interface AiResult {
  index: number;
  kind: TransactionKind;
  categoryId: string | null;
  confidence: number;
}

export function buildMessages(rows: AiRow[], categories: AiCategory[], examples: AiExample[]) {
  const categoryList = categories.map((c) => `${c.id} = ${c.name}`).join("\n");

  let system =
    "You categorize Swedish bank transactions. For each row classify it into a kind and, " +
    "for expenses, the best-fit category from the list.\n\n" +
    "kind is one of:\n" +
    "- income: money coming in. Salary (LÖN) is income.\n" +
    "- transfer: movement between the user's own accounts, card-bill payments " +
    "(SEB Kort, American Express/Amex), and top-ups to Revolut or Avanza. Transfers have categoryId null.\n" +
    "- expense: everything the user actually buys. Pick the best-fit categoryId.\n\n" +
    "Set categoryId to null when no category fits or when the kind is income/transfer.\n" +
    "confidence is a number from 0 to 1.\n\n" +
    "Categories (id = name):\n" +
    categoryList;

  if (examples.length > 0) {
    const exampleList = examples
      .map((e) => `${e.description} → kind=${e.kind}, category=${e.categoryName ?? "none"}`)
      .join("\n");
    system +=
      "\n\nHere are how the user has categorized similar transactions:\n" + exampleList;
  }

  const userLines = rows.map((r) => `${r.index} | ${r.amount} | ${r.description}`).join("\n");
  const user = "Classify each row (format: index | amount | description):\n" + userLines;

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

export async function categorizeWithOpenAI(
  rows: AiRow[],
  categories: AiCategory[],
  examples: AiExample[] = [],
): Promise<AiResult[]> {
  const client = new OpenAI();
  const messages = buildMessages(rows, categories, examples);

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    response_format: {
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
                required: ["index", "kind", "categoryId", "confidence"],
                properties: {
                  index: { type: "integer" },
                  kind: { type: "string", enum: ["expense", "income", "transfer"] },
                  categoryId: { type: ["string", "null"] },
                  confidence: { type: "number" },
                },
              },
            },
          },
        },
      },
    },
  });

  const content = completion.choices[0].message.content ?? "{}";
  const parsed = JSON.parse(content) as { results?: AiResult[] };
  const validIds = new Set(categories.map((c) => c.id));

  return (parsed.results ?? []).map((r) => ({
    index: r.index,
    kind: r.kind,
    categoryId: r.categoryId && validIds.has(r.categoryId) ? r.categoryId : null,
    confidence: Math.min(1, Math.max(0, r.confidence)),
  }));
}
