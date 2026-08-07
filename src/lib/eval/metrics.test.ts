import { describe, expect, it } from "vitest";
import { evaluate, type GoldExample } from "./metrics";
import { buildMaps } from "@/lib/domain/selectors";
import type { AiResult } from "@/lib/ai/categorize-openai";
import type { Category } from "@/lib/domain/types";

const CATEGORIES: Category[] = [
  { id: "cat-food", name: "Food", icon: "🍽", color: "0 0% 0%", parentId: null },
  { id: "cat-restaurants", name: "Restaurants", icon: "🍝", color: "0 0% 0%", parentId: "cat-food" },
  { id: "cat-cafe", name: "Café", icon: "☕", color: "0 0% 0%", parentId: "cat-food" },
  { id: "cat-housing", name: "Housing", icon: "🏠", color: "0 0% 0%", parentId: null },
];
const maps = buildMaps(CATEGORIES);

const gold = (o: Partial<GoldExample> = {}): GoldExample => ({
  description: "ICA MAXI",
  amount: -487,
  finalKind: "expense",
  finalCategoryId: "cat-food",
  finalTagIds: [],
  seen: false,
  ...o,
});

const pred = (o: Partial<AiResult> = {}): AiResult => ({
  index: 0,
  kind: "expense",
  categoryId: "cat-food",
  tagIds: [],
  confidence: 0.9,
  level: "likely",
  ...o,
});

describe("evaluate — accuracy", () => {
  it("scores an exact match as correct everywhere", () => {
    const m = evaluate([gold()], [pred()], maps);
    expect(m.overall.kindAccuracy).toBe(1);
    expect(m.overall.categoryAccuracy).toBe(1);
    expect(m.overall.categoryAccuracyRoot).toBe(1);
  });

  it("counts a wrong category as wrong", () => {
    const m = evaluate([gold()], [pred({ categoryId: "cat-housing" })], maps);
    expect(m.overall.categoryAccuracy).toBe(0);
    expect(m.overall.categoryAccuracyRoot).toBe(0);
  });

  it("separates a near miss inside the right family from a real failure", () => {
    // Café instead of Restaurants is a rounding error; Housing instead of Food is not. Exact and
    // root accuracy diverging is what tells you which problem you have.
    const m = evaluate(
      [gold({ finalCategoryId: "cat-restaurants" })],
      [pred({ categoryId: "cat-cafe" })],
      maps,
    );
    expect(m.overall.categoryAccuracy).toBe(0);
    expect(m.overall.categoryAccuracyRoot).toBe(1);
  });

  it("treats agreeing on 'no category' as correct", () => {
    const m = evaluate([gold({ finalCategoryId: null })], [pred({ categoryId: null })], maps);
    expect(m.overall.categoryAccuracy).toBe(1);
  });

  it("scores kind independently of category", () => {
    const m = evaluate([gold()], [pred({ kind: "income" })], maps);
    expect(m.overall.kindAccuracy).toBe(0);
    expect(m.overall.categoryAccuracy).toBe(1);
  });
});

describe("evaluate — tags", () => {
  it("is perfect when the tag sets match", () => {
    const m = evaluate([gold({ finalTagIds: ["a", "b"] })], [pred({ tagIds: ["b", "a"] })], maps);
    expect(m.overall.tagF1).toBe(1);
  });

  it("penalises a tag the model invented", () => {
    const m = evaluate([gold({ finalTagIds: ["a"] })], [pred({ tagIds: ["a", "b"] })], maps);
    expect(m.overall.tagPrecision).toBeCloseTo(0.5);
    expect(m.overall.tagRecall).toBe(1);
  });

  it("penalises a tag the model missed", () => {
    const m = evaluate([gold({ finalTagIds: ["a", "b"] })], [pred({ tagIds: ["a"] })], maps);
    expect(m.overall.tagPrecision).toBe(1);
    expect(m.overall.tagRecall).toBeCloseTo(0.5);
  });

  it("is 1 when both sides agree there are no tags", () => {
    // Most rows have no tags; scoring that as 0 would drown the signal.
    const m = evaluate([gold({ finalTagIds: [] })], [pred({ tagIds: [] })], maps);
    expect(m.overall.tagF1).toBe(1);
  });

  it("micro-averages, so a common tag isn't outweighed by a rare one", () => {
    const m = evaluate(
      [gold({ finalTagIds: ["a", "a2", "a3"] }), gold({ finalTagIds: ["b"] })],
      [pred({ index: 0, tagIds: ["a", "a2", "a3"] }), pred({ index: 1, tagIds: ["wrong"] })],
      maps,
    );
    // Micro: 3 of 4 predicted tags correct. Macro would score this 0.5.
    expect(m.overall.tagPrecision).toBeCloseTo(0.75);
  });
});

describe("evaluate — the seen/unseen split", () => {
  const rows = [gold({ seen: true }), gold({ seen: false, description: "OKÄND" })];

  it("reports each bucket separately with its own count", () => {
    const m = evaluate(rows, [pred({ index: 0 }), pred({ index: 1, categoryId: "cat-housing" })], maps);
    expect(m.seen.n).toBe(1);
    expect(m.unseen.n).toBe(1);
    expect(m.seen.categoryAccuracy).toBe(1);
    expect(m.unseen.categoryAccuracy).toBe(0);
    expect(m.overall.categoryAccuracy).toBe(0.5);
  });

  it("reports an empty bucket as zero rather than NaN", () => {
    const m = evaluate([gold({ seen: true })], [pred()], maps);
    expect(m.unseen.n).toBe(0);
    expect(Number.isNaN(m.unseen.categoryAccuracy)).toBe(false);
  });
});

describe("evaluate — confidence calibration", () => {
  it("separates mean confidence on right and wrong answers", () => {
    // If these are equal the confidence signal is noise and the review queue is random.
    const m = evaluate(
      [gold(), gold()],
      [pred({ index: 0, confidence: 0.95 }), pred({ index: 1, categoryId: "cat-housing", confidence: 0.3 })],
      maps,
    );
    expect(m.meanConfidenceCorrect).toBeCloseTo(0.95);
    expect(m.meanConfidenceWrong).toBeCloseTo(0.3);
  });

  it("measures how often a flagged row was actually wrong", () => {
    // Of the rows below the review threshold, the share that genuinely needed a human.
    const m = evaluate(
      [gold(), gold(), gold()],
      [
        pred({ index: 0, confidence: 0.3, level: "unsure", categoryId: "cat-housing" }), // flagged, wrong  ✓
        pred({ index: 1, confidence: 0.3, level: "unsure" }), // flagged, right ✗
        pred({ index: 2, confidence: 0.9, level: "confirmed" }), // not flagged
      ],
      maps,
    );
    expect(m.reviewFlagged).toBe(2);
    expect(m.reviewPrecision).toBeCloseTo(0.5);
  });

  it("reports zero review precision when nothing was flagged", () => {
    const m = evaluate([gold()], [pred({ confidence: 0.99, level: "confirmed" })], maps);
    expect(m.reviewFlagged).toBe(0);
    expect(Number.isNaN(m.reviewPrecision)).toBe(false);
  });
});

describe("evaluate — missing predictions", () => {
  it("counts a row the model never answered as wrong rather than skipping it", () => {
    const m = evaluate([gold(), gold()], [pred({ index: 0 })], maps);
    expect(m.overall.n).toBe(2);
    expect(m.overall.categoryAccuracy).toBe(0.5);
  });

  it("returns zeroed metrics for an empty gold set", () => {
    const m = evaluate([], [], maps);
    expect(m.overall.n).toBe(0);
    expect(m.overall.categoryAccuracy).toBe(0);
  });
});
