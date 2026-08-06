import { dedupKeyFor } from "@/lib/ai/normalize";
import { isGoldByHash } from "@/lib/ai/hash";
import type { ExampleSource, ExampleStatus } from "@/lib/db/schema";
import type { TransactionKind } from "@/lib/domain/types";

/** What a capture site knows about one row. */
export interface ExampleInput {
  rawDescription: string;
  cleanedDescription: string;
  amount: number;
  predictedKind: TransactionKind | null;
  predictedCategoryId: string | null;
  predictedTagIds: string[] | null;
  predictedConfidence: number | null;
  finalKind: TransactionKind;
  finalCategoryId: string | null;
  finalTagIds: string[];
}

/**
 * `affirm` overwrites the labels and approves the row; `touch` only bumps the sighting counters.
 *
 * The split is what stops the AI from promoting its own output to evidence.
 */
export type WriteMode = "affirm" | "touch";

export interface PlannedExample extends ExampleInput {
  id: string;
  userId: string;
  dedupKey: string;
  status: ExampleStatus;
  gold: boolean;
  corrected: boolean;
  source: ExampleSource;
  createdAt: string;
  lastSeenAt: string;
  hitCount: number;
  mode: WriteMode;
}

export interface PlanOptions {
  userId: string;
  now: string;
  idFor: () => string;
}

/**
 * Did the user actually vouch for this labelling?
 *
 * Note what is *not* consulted: the predicted kind. `Transaction` has no `predictedKind` column,
 * so the detail panel could only ever pass the row's current kind — comparing them was
 * meaningless. Category and tag changes are real signals; anything from the detail panel or a
 * manual entry is an affirmation by definition.
 */
function isCorrected(input: ExampleInput, source: ExampleSource): boolean {
  if (source === "detail" || source === "manual") return true;
  if (input.finalCategoryId !== input.predictedCategoryId) return true;
  const before = [...(input.predictedTagIds ?? [])].sort().join(",");
  const after = [...input.finalTagIds].sort().join(",");
  return before !== after;
}

/**
 * Turn a batch of captured rows into corpus writes.
 *
 * Pure so the interesting decisions — what counts as evidence, how a batch that mentions the same
 * merchant twice collapses — are testable without a database.
 *
 * Collapsing within the batch is not an optimisation: two rows sharing a `dedupKey` in one
 * upsert statement make Postgres refuse it outright ("ON CONFLICT DO UPDATE command cannot affect
 * row a second time").
 */
export function planExampleWrites(
  inputs: ExampleInput[],
  source: ExampleSource,
  opts: PlanOptions,
): PlannedExample[] {
  const byKey = new Map<string, PlannedExample>();

  for (const input of inputs) {
    const dedupKey = dedupKeyFor(input.cleanedDescription);
    if (!dedupKey) continue; // nothing identifying survived normalisation

    const corrected = isCorrected(input, source);
    const mode: WriteMode = corrected ? "affirm" : "touch";
    const existing = byKey.get(dedupKey);

    if (!existing) {
      const id = opts.idFor();
      byKey.set(dedupKey, {
        ...input,
        id,
        userId: opts.userId,
        dedupKey,
        status: mode === "affirm" ? "approved" : "candidate",
        gold: isGoldByHash(id),
        corrected,
        source,
        createdAt: opts.now,
        lastSeenAt: opts.now,
        hitCount: 1,
        mode,
      });
      continue;
    }

    // Same merchant twice in one batch: count both sightings, and let an affirmation win.
    existing.hitCount += 1;
    if (mode === "affirm" && existing.mode === "touch") {
      Object.assign(existing, input, {
        mode,
        corrected: true,
        status: "approved" as ExampleStatus,
      });
    }
  }

  return [...byKey.values()];
}
