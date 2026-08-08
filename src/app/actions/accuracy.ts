"use server";

import { getUserId } from "@/lib/auth";
import { categorizeTransactions } from "./ai";
import { getDataset } from "@/lib/db/queries";
import { loadCorpus, insertAccuracyRun, loadAccuracyRuns } from "@/lib/db/corpus-queries";
import { retrieveNeighbours } from "@/lib/ai/retrieve";
import { coverageFrom } from "@/lib/eval/coverage";
import { sampleForScoring, scoreAccuracy, type Miss } from "@/lib/eval/score";
import type { AiRow } from "@/lib/ai/categorize-openai";

export interface AccuracyPoint {
  at: string;
  sampled: number;
  /** Right about a place hidden from its own lookup — one it has never seen. */
  correct: number;
  /** Right about a place the corpus still holds — one it knows. */
  correctSeen: number;
  txTotal: number;
  txCovered: number;
  misses: Miss[];
}

type Row = {
  createdAt: string;
  sampled: number;
  correct: number;
  correctSeen: number;
  txTotal: number;
  txCovered: number;
  misses: Miss[];
};

const toPoint = (r: Row): AccuracyPoint => ({
  at: r.createdAt,
  sampled: r.sampled,
  correct: r.correct,
  correctSeen: r.correctSeen,
  txTotal: r.txTotal,
  txCovered: r.txCovered,
  misses: r.misses ?? [],
});

export async function accuracyHistory(): Promise<AccuracyPoint[]> {
  return (await loadAccuracyRuns(await getUserId())).map((r) => toPoint(r as Row));
}

/**
 * One check, three questions.
 *
 *  - **Coverage.** Of the transactions you actually have, how many are from a place the categorizer
 *    already knows? Measured through the real hybrid retrieval, so it describes the system that
 *    ships rather than a substring proxy that would drift from it.
 *  - **Knows it.** Score a sample with the corpus intact — exactly how production runs. Expected to
 *    be high; if it is not, the model is ignoring evidence it was handed, which is worth seeing.
 *  - **New to it.** Score the same sample with each place hidden from its own lookup. Harder, and
 *    the number that improves as the corpus grows.
 *
 * Both scores come from the same sample so the pair is comparable, and both run the real
 * `categorizeTransactions` rather than a parallel implementation.
 */
export async function measureAccuracy(): Promise<AccuracyPoint[]> {
  const userId = await getUserId();
  const approved = await loadCorpus(userId, { includeCandidates: false });
  const sample = sampleForScoring(approved);
  if (!sample.length) return accuracyHistory();

  const rows: AiRow[] = sample.map((r, index) => ({
    index,
    description: r.cleanedDescription,
    amount: r.amount,
  }));

  const [unseen, seen] = await Promise.all([
    categorizeTransactions(rows, { excludeSelf: true }),
    categorizeTransactions(rows),
  ]);
  const unseenScore = scoreAccuracy(sample, unseen);
  const seenScore = scoreAccuracy(sample, seen);

  // Coverage over the real ledger, not the corpus: the question is what arrives, not what is stored.
  const data = await getDataset(userId);
  const ledger = data.transactions
    .filter((t) => !t.excluded)
    .map((t, index) => ({ index, description: t.description, amount: t.amount }));
  const neighbours = ledger.length ? await retrieveNeighbours(userId, ledger) : new Map();
  const coverage = coverageFrom(ledger, neighbours);

  await insertAccuracyRun({
    id: `acc-${crypto.randomUUID()}`,
    userId,
    createdAt: new Date().toISOString(),
    sampled: unseenScore.sampled,
    correct: unseenScore.correct,
    correctSeen: seenScore.correct,
    txTotal: coverage.total,
    txCovered: coverage.covered,
    corpusSize: approved.length,
    misses: unseenScore.misses,
  });
  return accuracyHistory();
}
