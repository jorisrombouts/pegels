import OpenAI from "openai";

/**
 * Embeddings for retrieval.
 *
 * `text-embedding-3-small` at its native 1536 dims. Cost is negligible next to the chat call —
 * a 200-row import needs roughly one request and ~400 tokens — so this is never worth optimising.
 *
 * The contract that matters: **this never throws.** A failed chunk yields `null` for its slice and
 * nothing else, because the lexical arm of retrieval must keep working without embeddings. An
 * embeddings outage degrades quality; it does not break import.
 */

export const EMBED_MODEL = "text-embedding-3-small";
/** The API allows 2048 inputs; 256 keeps request bodies small so a retry is cheap. */
export const EMBED_CHUNK = 256;

export async function embedMany(texts: string[]): Promise<(number[] | null)[]> {
  const out: (number[] | null)[] = texts.map(() => null);

  // An empty string is not embeddable and the API rejects it — drop it here, keep the slot null.
  const jobs = texts.map((text, index) => ({ text, index })).filter((j) => j.text.trim().length > 0);
  if (jobs.length === 0) return out;

  const client = new OpenAI();
  const chunks: { text: string; index: number }[][] = [];
  for (let i = 0; i < jobs.length; i += EMBED_CHUNK) chunks.push(jobs.slice(i, i + EMBED_CHUNK));

  const settled = await Promise.allSettled(
    chunks.map(async (chunk) => {
      const res = await client.embeddings.create({ model: EMBED_MODEL, input: chunk.map((j) => j.text) });
      return { chunk, res };
    }),
  );

  let failedChunks = 0;
  for (const s of settled) {
    if (s.status !== "fulfilled") {
      failedChunks += 1;
      continue; // this chunk's slots stay null
    }
    const { chunk, res } = s.value;
    // `data` is not guaranteed to be ordered — each item carries its position in the request.
    for (const item of res.data) out[chunk[item.index].index] = item.embedding as number[];
  }
  if (failedChunks > 0) {
    console.error(`embedMany: ${failedChunks}/${chunks.length} chunks failed; those rows stay unembedded`);
  }
  return out;
}
