import { and, eq, isNull, ne, sql, type SQL } from "drizzle-orm";
import { db } from "./index";
import { categorizationExamples, EMBED_DIMS, type ExampleStatus } from "./schema";
import type { PlannedExample } from "../corpus/record";
import type { TransactionKind } from "../domain/types";

/** A corpus row as retrieval and the prompt need it — never carries the embedding. */
export interface CorpusRow {
  id: string;
  dedupKey: string;
  cleanedDescription: string;
  amount: number;
  finalKind: TransactionKind;
  finalCategoryId: string | null;
  finalTagIds: string[];
  hitCount: number;
  lastSeenAt: string;
}

/**
 * The one place `gold = false` is enforced.
 *
 * Centralising this is the point: a retrieval path that forgets it silently inflates every eval
 * number by letting the model look up its own answers, and that class of bug is invisible.
 */
export function corpusFilter(userId: string, opts: { includeCandidates: boolean }): SQL {
  const base = and(
    eq(categorizationExamples.userId, userId),
    eq(categorizationExamples.gold, false),
  )!;
  return opts.includeCandidates
    ? and(base, ne(categorizationExamples.status, "rejected"))!
    : and(base, eq(categorizationExamples.status, "approved"))!;
}

/** How many approved examples before retrieval stops leaning on unreviewed candidates. */
export const MIN_APPROVED_FOR_STRICT = 50;

export async function countApproved(userId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(categorizationExamples)
    .where(and(eq(categorizationExamples.userId, userId), eq(categorizationExamples.status, "approved")));
  return rows[0]?.n ?? 0;
}

/**
 * Every retrievable corpus row, minus the embedding column.
 *
 * The lexical arm runs in memory over this. At ~100 bytes a row a 2 000-row corpus is ~200 KB,
 * which is far cheaper than a second round-trip — and it keeps the lexical arm working when
 * embeddings are missing entirely.
 */
export async function loadCorpus(userId: string, opts: { includeCandidates: boolean }): Promise<CorpusRow[]> {
  const rows = await db
    .select({
      id: categorizationExamples.id,
      dedupKey: categorizationExamples.dedupKey,
      cleanedDescription: categorizationExamples.cleanedDescription,
      amount: categorizationExamples.amount,
      finalKind: categorizationExamples.finalKind,
      finalCategoryId: categorizationExamples.finalCategoryId,
      finalTagIds: categorizationExamples.finalTagIds,
      hitCount: categorizationExamples.hitCount,
      lastSeenAt: categorizationExamples.lastSeenAt,
    })
    .from(categorizationExamples)
    .where(corpusFilter(userId, opts));
  return rows.map((r) => ({ ...r, amount: Number(r.amount) }));
}

/** Rows still awaiting an embedding — the lazy self-heal worklist. */
export async function unembeddedRows(
  userId: string,
  limit = 512,
): Promise<{ id: string; cleanedDescription: string }[]> {
  return db
    .select({ id: categorizationExamples.id, cleanedDescription: categorizationExamples.cleanedDescription })
    .from(categorizationExamples)
    .where(
      and(
        eq(categorizationExamples.userId, userId),
        isNull(categorizationExamples.embedding),
        ne(categorizationExamples.status, "rejected"),
      ),
    )
    .limit(limit);
}

/** Write freshly computed embeddings back in one round-trip. */
export async function saveEmbeddings(
  rows: { id: string; embedding: number[]; model: string }[],
): Promise<void> {
  if (!rows.length) return;
  const ops = rows.map((r) =>
    db
      .update(categorizationExamples)
      .set({ embedding: r.embedding, embeddingModel: r.model })
      .where(eq(categorizationExamples.id, r.id)),
  );
  await db.batch(ops as [(typeof ops)[number], ...typeof ops]);
}

/**
 * Write captured rows into the corpus.
 *
 * Two conflict clauses, deliberately not one clause with CASE logic, because they encode two
 * invariants that must not be accidentally merged:
 *
 *  - **`rejected` is sticky.** No passive path may resurrect a merchant the user dismissed, or
 *    every import re-floods the curation queue with the same rejects.
 *  - **`approved` never downgrades.** A passive sighting touches only the counters; it can never
 *    overwrite labels the user vouched for.
 */
export async function upsertExamples(rows: PlannedExample[]): Promise<void> {
  if (!rows.length) return;

  const toRow = (p: PlannedExample) => ({
    id: p.id,
    userId: p.userId,
    dedupKey: p.dedupKey,
    rawDescription: p.rawDescription,
    cleanedDescription: p.cleanedDescription,
    amount: String(p.amount),
    predictedKind: p.predictedKind,
    predictedCategoryId: p.predictedCategoryId,
    predictedConfidence: p.predictedConfidence,
    finalKind: p.finalKind,
    finalCategoryId: p.finalCategoryId,
    finalTagIds: p.finalTagIds,
    status: p.status,
    gold: p.gold,
    corrected: p.corrected,
    source: p.source,
    createdAt: p.createdAt,
    lastSeenAt: p.lastSeenAt,
    hitCount: p.hitCount,
  });

  const target = [categorizationExamples.userId, categorizationExamples.dedupKey];
  const ops = rows.map((p) => {
    const row = toRow(p);
    if (p.mode === "affirm") {
      return db
        .insert(categorizationExamples)
        .values(row)
        .onConflictDoUpdate({
          target,
          set: {
            finalKind: row.finalKind,
            finalCategoryId: row.finalCategoryId,
            finalTagIds: row.finalTagIds,
            predictedKind: row.predictedKind,
            predictedCategoryId: row.predictedCategoryId,
            predictedConfidence: row.predictedConfidence,
            corrected: true,
            // An explicit correction un-rejects: the user just told us what this should be.
            status: "approved",
            lastSeenAt: row.lastSeenAt,
            hitCount: sql`${categorizationExamples.hitCount} + ${row.hitCount}`,
            // The embedding depends only on the description, so a re-label never invalidates it.
          },
        });
    }
    return db
      .insert(categorizationExamples)
      .values(row)
      .onConflictDoUpdate({
        target,
        set: {
          lastSeenAt: row.lastSeenAt,
          hitCount: sql`${categorizationExamples.hitCount} + ${row.hitCount}`,
        },
      });
  });

  await db.batch(ops as [(typeof ops)[number], ...typeof ops]);
}

export interface VectorHit {
  queryIndex: number;
  id: string;
  similarity: number;
}

/** Vectors per SQL statement. Keeps each request body around 700 KB at 1536 dims. */
const VECTORS_PER_STATEMENT = 40;
/** Candidates fetched per query vector before fusion. */
export const VECTOR_K = 8;

/**
 * Nearest corpus rows for many query vectors at once.
 *
 * The Neon HTTP driver has no interactive transactions and every statement is a round-trip, so
 * issuing one `ORDER BY embedding <=> $1` per row is not an option for a 200-row import. Instead
 * each statement joins a VALUES list of query vectors against a LATERAL top-k, and all statements
 * go out in a single `db.batch` — one HTTP round-trip for the whole batch.
 *
 * Written with the `sql` template because Drizzle's builder can't express CROSS JOIN LATERAL over
 * VALUES; the vectors are still parameterised, never concatenated.
 */
export async function nearestByVector(
  userId: string,
  vectors: number[][],
  opts: { includeCandidates: boolean; k?: number },
): Promise<VectorHit[]> {
  if (!vectors.length) return [];
  const k = opts.k ?? VECTOR_K;
  const where = corpusFilter(userId, opts);

  const chunks: { offset: number; vectors: number[][] }[] = [];
  for (let i = 0; i < vectors.length; i += VECTORS_PER_STATEMENT) {
    chunks.push({ offset: i, vectors: vectors.slice(i, i + VECTORS_PER_STATEMENT) });
  }

  const statements = chunks.map(({ vectors: vs }) => {
    const values = sql.join(
      vs.map((v, i) => sql`(${i}::int, ${JSON.stringify(v)}::vector(${sql.raw(String(EMBED_DIMS))}))`),
      sql`, `,
    );
    // No table alias inside the LATERAL: `where` comes from corpusFilter, which references the
    // table by its real name, and an alias would put those references out of scope.
    return db.execute(sql`
      SELECT q.idx AS "queryIndex", e.id AS "id", 1 - (e.dist) AS "similarity"
      FROM (VALUES ${values}) AS q(idx, v)
      CROSS JOIN LATERAL (
        SELECT ${categorizationExamples.id} AS id,
               ${categorizationExamples.embedding} <=> q.v AS dist
        FROM ${categorizationExamples}
        WHERE ${where} AND ${categorizationExamples.embedding} IS NOT NULL
        ORDER BY ${categorizationExamples.embedding} <=> q.v
        LIMIT ${k}
      ) e
    `);
  });

  const results = await db.batch(statements as [(typeof statements)[number], ...typeof statements]);

  const hits: VectorHit[] = [];
  results.forEach((res, chunkIdx) => {
    const rows = (res as unknown as { rows?: unknown[] }).rows ?? (res as unknown as unknown[]);
    for (const raw of rows as { queryIndex: number; id: string; similarity: number }[]) {
      hits.push({
        queryIndex: chunks[chunkIdx].offset + Number(raw.queryIndex),
        id: raw.id,
        similarity: Number(raw.similarity),
      });
    }
  });
  return hits;
}

export type { ExampleStatus };
