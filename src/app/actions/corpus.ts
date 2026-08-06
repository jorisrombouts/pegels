"use server";

import { getUserId } from "@/lib/auth";
import { upsertExamples } from "@/lib/db/corpus-queries";
import { planExampleWrites, type ExampleInput } from "@/lib/corpus/record";
import type { ExampleSource } from "@/lib/db/schema";

export type { ExampleInput };

/**
 * The single capture API for everything the user tells us about a categorization.
 *
 * Replaces logImportExamples / logDetailCorrection / logDetailApproval, which recorded kind and
 * category only — tag edits were never captured at all.
 *
 * Fire-and-forget from the UI: a correction must never block on a database write, and a lost
 * example costs one piece of evidence, not the user's edit.
 */
export async function recordExamples(rows: ExampleInput[], source: ExampleSource): Promise<void> {
  if (!rows.length) return;
  const userId = await getUserId();
  const planned = planExampleWrites(rows, source, {
    userId,
    now: new Date().toISOString(),
    idFor: () => `ex-${crypto.randomUUID()}`,
  });
  await upsertExamples(planned);
}
