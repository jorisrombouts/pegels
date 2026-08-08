import { getDataset } from "@/lib/db/queries";
import { upsertExamples, unembeddedRows, saveEmbeddings } from "@/lib/db/corpus-queries";
import { EMBED_MODEL, embedMany } from "@/lib/ai/embed";
import { normalizeMerchant } from "@/lib/ai/normalize";
import { planExampleWrites } from "./record";
import { planCorpusBackfill, type BackfillOptions } from "./backfill";

export interface BackfillReport {
  /** Transactions that qualified as evidence. */
  considered: number;
  /** Distinct merchants written (many transactions collapse into one corpus row). */
  merchants: number;
  embedded: number;
  stillUnembedded: number;
}

/**
 * Seed the corpus from the user's own categorization history, then embed what landed.
 *
 * Idempotent: writes go through the same dedupKey upsert as live capture, with `hitCountMode:
 * "seed"` so a second run takes the larger count instead of doubling it.
 */
export async function runCorpusBackfill(
  userId: string,
  opts: BackfillOptions & { embed?: boolean } = { includeHighConfidenceModel: false },
): Promise<BackfillReport> {
  const data = await getDataset(userId);
  const inputs = planCorpusBackfill(data.transactions, opts);

  const planned = planExampleWrites(inputs, "backfill", {
    userId,
    now: new Date().toISOString(),
    idFor: () => `ex-${crypto.randomUUID()}`,
  });
  await upsertExamples(planned);

  let embedded = 0;
  if (opts.embed !== false) {
    // Embed in bounded passes; a failure leaves rows for the lazy heal at the next retrieval.
    for (;;) {
      const pending = await unembeddedRows(userId, 256);
      if (!pending.length) break;
      const vectors = await embedMany(pending.map((p) => normalizeMerchant(p.cleanedDescription)));
      const writes = pending
        .map((p, i) => ({ id: p.id, embedding: vectors[i], model: EMBED_MODEL }))
        .filter((w): w is { id: string; embedding: number[]; model: string } => w.embedding !== null);
      if (!writes.length) break; // the API is failing; stop rather than spin
      await saveEmbeddings(writes);
      embedded += writes.length;
      if (pending.length < 256) break;
    }
  }

  const stillUnembedded = (await unembeddedRows(userId, 1000)).length;
  return { considered: inputs.length, merchants: planned.length, embedded, stillUnembedded };
}
