import { describe, expect, it } from "vitest";
import { sampleForScoring, scoreAccuracy } from "./score";
import type { CorpusRow } from "@/lib/corpus/types";
import type { AiResult } from "@/lib/ai/categorize-openai";

const row = (id: string, categoryId: string | null): CorpusRow => ({
  id,
  dedupKey: id,
  cleanedDescription: id,
  amount: -100,
  finalKind: "expense",
  finalCategoryId: categoryId,
  finalTagIds: [],
  hitCount: 1,
  lastSeenAt: "2026-06-01",
  status: "approved",
});

const said = (index: number, categoryId: string | null): AiResult =>
  ({ index, kind: "expense", categoryId, tagIds: [], confidence: 0.9, level: "high" }) as AiResult;

describe("sampleForScoring", () => {
  it("keeps everything when the corpus is smaller than the sample", () => {
    const rows = [row("a", null), row("b", null)];
    expect(sampleForScoring(rows, 60)).toHaveLength(2);
  });

  it("picks the same places every run, so the trend moves only when accuracy does", () => {
    const rows = Array.from({ length: 200 }, (_, i) => row(`ex-${i}`, "cat-a"));
    const a = sampleForScoring(rows, 20).map((r) => r.id);
    const b = sampleForScoring([...rows].reverse(), 20).map((r) => r.id);
    expect(a).toHaveLength(20);
    expect(new Set(b)).toEqual(new Set(a)); // membership is the id's hash, not the input order
  });
});

describe("scoreAccuracy", () => {
  it("counts a place as right only when the category matches what was confirmed", () => {
    const sample = [row("a", "cat-food"), row("b", "cat-rent")];
    const score = scoreAccuracy(sample, [said(0, "cat-food"), said(1, "cat-travel")]);
    expect(score).toMatchObject({ sampled: 2, correct: 1, accuracy: 0.5 });
  });

  it("treats an unanswered place as wrong rather than skipping it", () => {
    const sample = [row("a", "cat-food"), row("b", "cat-rent")];
    const score = scoreAccuracy(sample, [said(0, "cat-food")]); // nothing came back for index 1
    expect(score).toMatchObject({ correct: 1, sampled: 2, accuracy: 0.5 });
  });

  it("matches an uncategorized place only against no category", () => {
    expect(scoreAccuracy([row("a", null)], [said(0, null)]).correct).toBe(1);
    expect(scoreAccuracy([row("a", null)], [said(0, "cat-food")]).correct).toBe(0);
  });

  it("reports zero rather than dividing by zero on an empty corpus", () => {
    expect(scoreAccuracy([], [])).toMatchObject({ sampled: 0, correct: 0, accuracy: 0 });
  });
});
