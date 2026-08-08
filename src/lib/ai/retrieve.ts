import {
  MIN_APPROVED_FOR_STRICT,
  countApproved,
  loadCorpus,
  nearestByVector,
  saveEmbeddings,
  unembeddedRows,
  type CorpusRow,
} from "@/lib/db/corpus-queries";
import { EMBED_MODEL, embedMany } from "./embed";
import { NEIGHBOURS_PER_ROW, W_LEXICAL, W_VECTOR, diversify, rrf, sameMagnitude, AMOUNT_BONUS } from "./fuse";
import { normalizeMerchant } from "./normalize";
import { merchantTokens, tokenOverlap } from "@/lib/text/merchant-tokens";

export interface Neighbour extends CorpusRow {
  /** True when this came from the approved corpus rather than the unreviewed candidate pool. */
  approved: boolean;
}

export interface RetrievalRow {
  index: number;
  description: string;
  amount: number;
}

/** Lexical candidates considered per query before fusion. */
const LEXICAL_K = 8;

/**
 * Cosine similarity below which a vector hit is noise, not evidence.
 *
 * The vector arm returns its top k however distant they are, so without a floor an unrecognised
 * merchant still comes back with "neighbours" — which both misleads the model and, worse, stops
 * `clampConfidence` from flagging it for review.
 *
 * Measured against the real corpus with text-embedding-3-small: an exact merchant scores 1.00 and
 * a true match ~0.61, while unrelated merchants and outright nonsense top out around 0.48. 0.55
 * sits in that gap. Short merchant strings embed poorly — the lexical arm is what carries those.
 */
const MIN_VECTOR_SIMILARITY = 0.55;


/**
 * Retrieve the confirmed examples most likely to settle each row, hybrid.
 *
 * Two arms, fused by reciprocal rank: pgvector cosine over the embedded corpus, and lexical
 * merchant-token overlap. The lexical arm is deliberately independent of embeddings — if the
 * embeddings API is down or the corpus is unembedded, retrieval degrades rather than fails.
 *
 * Two structural moves keep this to one database round-trip for a 200-row import: query texts are
 * deduplicated by merchant first (200 rows are typically ~80 distinct merchants), and the vector
 * search issues one batched statement set rather than one query per row.
 */
export async function retrieveNeighbours(
  userId: string,
  rows: RetrievalRow[],
  /**
   * `excludeSelf` drops the queried merchant's own corpus row from its results — leave-one-out, so
   * accuracy can be measured without the answer being one of the examples. Query text and dedup key
   * are the same function (`normalizeMerchant`), so an exact key match identifies the row itself.
   * Off in normal use, where every example should count.
   */
  opts: { limit?: number; excludeSelf?: boolean } = {},
): Promise<Map<number, Neighbour[]>> {
  const limit = opts.limit ?? NEIGHBOURS_PER_ROW;
  const out = new Map<number, Neighbour[]>(rows.map((r) => [r.index, []]));
  if (!rows.length) return out;

  // A thin approved corpus retrieves nothing at all, which is the cold-start trap. Below the
  // threshold, unreviewed candidates participate — the prompt renders them as weaker evidence.
  const approvedCount = await countApproved(userId);
  const includeCandidates = approvedCount < MIN_APPROVED_FOR_STRICT;

  await healMissingEmbeddings(userId);

  const corpus = await loadCorpus(userId, { includeCandidates });
  if (!corpus.length) return out;
  const byId = new Map(corpus.map((c) => [c.id, c]));

  // One query per distinct merchant, fanned back to the rows that share it.
  const queries = new Map<string, { key: string; amount: number; indices: number[] }>();
  for (const r of rows) {
    const key = normalizeMerchant(r.description);
    const q = queries.get(key);
    if (q) q.indices.push(r.index);
    else queries.set(key, { key, amount: r.amount, indices: [r.index] });
  }
  const distinct = [...queries.values()];

  const vectors = await embedMany(distinct.map((q) => q.key));
  const embedded = distinct
    .map((q, i) => ({ q, vector: vectors[i], queryIndex: i }))
    .filter((e): e is { q: (typeof distinct)[number]; vector: number[]; queryIndex: number } => e.vector !== null);

  // Vector arm. Skipped entirely when nothing embedded — the lexical arm still runs.
  const vectorHitsByQuery = new Map<string, string[]>();
  if (embedded.length) {
    const hits = await nearestByVector(userId, embedded.map((e) => e.vector), { includeCandidates });
    const grouped = new Map<number, { id: string; similarity: number }[]>();
    for (const h of hits) {
      const list = grouped.get(h.queryIndex);
      if (list) list.push(h);
      else grouped.set(h.queryIndex, [h]);
    }
    embedded.forEach((e, i) => {
      const list = (grouped.get(i) ?? [])
        .filter((h) => h.similarity >= MIN_VECTOR_SIMILARITY)
        .sort((a, b) => b.similarity - a.similarity);
      vectorHitsByQuery.set(e.q.key, list.map((h) => h.id));
    });
  }

  // Lexical arm, in memory over the corpus we already loaded.
  const corpusTokens = corpus.map((c) => ({ row: c, tokens: merchantTokens(c.cleanedDescription) }));
  for (const q of distinct) {
    const queryTokens = new Set(merchantTokens(q.key));
    const lexical = corpusTokens
      .map(({ row, tokens }) => ({ row, score: tokenOverlap(queryTokens, tokens) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score || b.row.hitCount - a.row.hitCount || b.row.lastSeenAt.localeCompare(a.row.lastSeenAt))
      .slice(0, LEXICAL_K)
      .map((c) => c.row.id);

    const fused = rrf([
      { weight: W_VECTOR, ids: vectorHitsByQuery.get(q.key) ?? [] },
      { weight: W_LEXICAL, ids: lexical },
    ]);

    // Amount is a re-rank nudge rather than part of the embedding — see fuse.sameMagnitude.
    const ranked = fused
      .map(({ id, score }) => {
        const row = byId.get(id);
        if (!row) return null;
        if (opts.excludeSelf && row.dedupKey === q.key) return null;
        return { row, score: score * (1 + (sameMagnitude(q.amount, row.amount) ? AMOUNT_BONUS : 0)) };
      })
      .filter((r): r is { row: CorpusRow; score: number } => r !== null)
      .sort((a, b) => b.score - a.score);

    // Per row, not per corpus: when candidates are in play the two kinds come back mixed, and the
    // prompt renders them under different headings.
    const neighbours = diversify(ranked, (r) => r.row.dedupKey, limit).map(
      (r): Neighbour => ({ ...r.row, approved: r.row.status === "approved" }),
    );
    for (const index of q.indices) out.set(index, neighbours);
  }

  return out;
}

/**
 * Embed whatever the write path couldn't.
 *
 * Writes fire-and-forget their embedding so a user click never waits on the embeddings API; this
 * pass is what makes that safe, turning a write-time failure into a delay rather than a permanent
 * hole in the corpus.
 */
async function healMissingEmbeddings(userId: string): Promise<void> {
  const pending = await unembeddedRows(userId);
  if (!pending.length) return;
  const vectors = await embedMany(pending.map((p) => normalizeMerchant(p.cleanedDescription)));
  const writes = pending
    .map((p, i) => ({ id: p.id, embedding: vectors[i], model: EMBED_MODEL }))
    .filter((w): w is { id: string; embedding: number[]; model: string } => w.embedding !== null);
  if (writes.length) await saveEmbeddings(writes);
}
