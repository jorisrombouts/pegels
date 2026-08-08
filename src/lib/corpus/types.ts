import type { ExampleStatus } from "@/lib/db/schema";
import type { TransactionKind } from "@/lib/domain/types";

/**
 * Corpus shapes shared between the server actions and the UI.
 *
 * These live here rather than being re-exported from `app/actions/corpus.ts` because a
 * `"use server"` module may only export async functions — Next turns every export into an action
 * reference, so a re-exported type becomes a runtime `ReferenceError` on every page that loads the
 * actions bundle. Types have to come from a plain module.
 */

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
  /**
   * Needed by retrieval, not just curation: while the approved corpus is thin, retrieval loads
   * candidates alongside approved rows, and the prompt renders the two under different headings.
   */
  status: ExampleStatus;
}

/** A corpus row as the curation page shows it. */
export interface CurationRow extends CorpusRow {
  source: string;
  createdAt: string;
  embedded: boolean;
}
