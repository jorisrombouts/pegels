import type { TransactionKind } from "@/lib/domain/types";

export interface ExampleRow {
  cleanedDescription: string;
  finalKind: TransactionKind;
  finalCategoryId: string | null;
}

/** Letter-only tokens (digits dropped), lowercased, length >= 3 — for loose merchant matching. */
export function merchantTokens(desc: string): string[] {
  return (desc.toLowerCase().match(/[a-zåäö]+/g) ?? []).filter((t) => t.length >= 3);
}

const DEFAULT_LIMIT = 40;

/**
 * Few-shot example list for a batch: corrections relevant to the rows first (shared merchant token),
 * then the remaining corrections, then recent rows as a cold-start top-up. Deduped by
 * description+kind+category (keeping the first/newest) and capped at `limit`.
 */
export function selectExamples(opts: {
  rows: { description: string }[];
  corrected: ExampleRow[];
  recent: ExampleRow[];
  limit?: number;
}): ExampleRow[] {
  const { rows, corrected, recent, limit = DEFAULT_LIMIT } = opts;
  const batchTokens = new Set(rows.flatMap((r) => merchantTokens(r.description)));
  const isRelevant = (e: ExampleRow) => merchantTokens(e.cleanedDescription).some((t) => batchTokens.has(t));

  const ordered = [...corrected.filter(isRelevant), ...corrected.filter((e) => !isRelevant(e)), ...recent];

  const seen = new Set<string>();
  const out: ExampleRow[] = [];
  for (const e of ordered) {
    const key = `${e.cleanedDescription.toLowerCase()}|${e.finalKind}|${e.finalCategoryId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}
