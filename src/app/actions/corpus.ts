"use server";

import { getUserId } from "@/lib/auth";
import { deleteExample, loadCurationRows, updateExample, upsertExamples } from "@/lib/db/corpus-queries";
import { runCorpusBackfill } from "@/lib/corpus/backfill-run";
import { planExampleWrites } from "@/lib/corpus/record";
import type { ExampleInput, CurationRow } from "@/lib/corpus/types";
import type { ExampleSource, ExampleStatus } from "@/lib/db/schema";
import type { TransactionKind } from "@/lib/domain/types";

// NOTE: a "use server" module may only export async functions — Next turns every export into an
// action reference, so re-exporting a type here is a runtime ReferenceError on every page that
// loads the actions bundle. Shared types live in @/lib/corpus/types.

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

// ── Curation ──

export async function loadCorpusRows(): Promise<CurationRow[]> {
  return loadCurationRows(await getUserId());
}

/** Promote an unreviewed candidate, correcting it on the way in if needed. */
export async function approveExample(
  id: string,
  patch: { finalCategoryId?: string | null; finalTagIds?: string[]; finalKind?: TransactionKind } = {},
): Promise<void> {
  await updateExample(await getUserId(), id, { ...patch, status: "approved" });
}

/** Dismiss a merchant. Sticky — no passive import can resurrect it into the queue. */
export async function rejectExample(id: string): Promise<void> {
  await updateExample(await getUserId(), id, { status: "rejected" });
}

export async function setExampleStatus(id: string, status: ExampleStatus): Promise<void> {
  await updateExample(await getUserId(), id, { status });
}

/** Move a row in or out of the eval hold-out. Gold rows never take part in retrieval. */
export async function setExampleGold(id: string, gold: boolean): Promise<void> {
  await updateExample(await getUserId(), id, { gold });
}

export async function editExample(
  id: string,
  patch: { finalCategoryId?: string | null; finalTagIds?: string[]; finalKind?: TransactionKind },
): Promise<void> {
  await updateExample(await getUserId(), id, patch);
}

export async function removeExample(id: string): Promise<void> {
  await deleteExample(await getUserId(), id);
}

/** Seed the corpus from the user's own categorization history. Idempotent. */
export async function backfillCorpus(includeHighConfidenceModel = false) {
  return runCorpusBackfill(await getUserId(), { includeHighConfidenceModel });
}
