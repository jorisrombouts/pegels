"use server";

import { getUserId } from "@/lib/auth";
import { categorizeTransactions } from "./ai";
import { loadCorpus, insertAccuracyRun, loadAccuracyRuns } from "@/lib/db/corpus-queries";
import { sampleForScoring, scoreAccuracy } from "@/lib/eval/score";
import type { AiRow } from "@/lib/ai/categorize-openai";

export interface AccuracyPoint {
  at: string;
  sampled: number;
  correct: number;
  accuracy: number;
}

const toPoint = (r: { createdAt: string; sampled: number; correct: number }): AccuracyPoint => ({
  at: r.createdAt,
  sampled: r.sampled,
  correct: r.correct,
  accuracy: r.sampled ? r.correct / r.sampled : 0,
});

export async function accuracyHistory(): Promise<AccuracyPoint[]> {
  return (await loadAccuracyRuns(await getUserId())).map(toPoint);
}

/**
 * Re-label a sample of confirmed places with each one hidden from its own lookup, and count how
 * often the categorizer lands on the label the user confirmed.
 *
 * Hiding the place from itself is the whole point: with it visible the lookup would hand the model
 * the answer, and the score would only prove the corpus can find itself. It runs the same
 * `categorizeTransactions` the app uses, so the number describes the real thing rather than a
 * parallel implementation that could drift from it.
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
  const results = await categorizeTransactions(rows, { excludeSelf: true });
  const score = scoreAccuracy(sample, results);

  await insertAccuracyRun({
    id: `acc-${crypto.randomUUID()}`,
    userId,
    createdAt: new Date().toISOString(),
    sampled: score.sampled,
    correct: score.correct,
    corpusSize: approved.length,
  });
  return accuracyHistory();
}
