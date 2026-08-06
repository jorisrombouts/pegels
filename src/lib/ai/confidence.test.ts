import { describe, expect, it } from "vitest";
import { clampConfidence, type RetrievalEvidence } from "./confidence";

const ev = (o: Partial<RetrievalEvidence> = {}): RetrievalEvidence => ({
  neighbourCount: 3,
  topOverlap: 0.4,
  topNeighbourCategoryId: "cat-groceries",
  ...o,
});

describe("clampConfidence", () => {
  it("caps a row nothing was retrieved for, so it lands in the review queue", () => {
    // "The system has never seen this" is exactly what the queue should surface.
    const c = clampConfidence(0.95, ev({ neighbourCount: 0, topNeighbourCategoryId: null }), "cat-groceries");
    expect(c).toBeLessThan(0.6);
  });

  it("promotes a near-exact merchant match the model agreed with", () => {
    const c = clampConfidence(0.7, ev({ topOverlap: 0.9 }), "cat-groceries");
    expect(c).toBeGreaterThanOrEqual(0.95);
  });

  it("does not promote when the model disagreed with its closest neighbour", () => {
    // High overlap but a different answer is a genuine conflict, not a settled merchant.
    const c = clampConfidence(0.7, ev({ topOverlap: 0.9 }), "cat-restaurants");
    expect(c).toBeCloseTo(0.7);
  });

  it("does not promote on a weak match even when they agree", () => {
    expect(clampConfidence(0.7, ev({ topOverlap: 0.3 }), "cat-groceries")).toBeCloseTo(0.7);
  });

  it("leaves an ordinary prediction untouched", () => {
    expect(clampConfidence(0.72, ev(), "cat-transit")).toBeCloseTo(0.72);
  });

  it("keeps the result within 0..1 whatever the model returned", () => {
    expect(clampConfidence(4, ev(), "cat-transit")).toBe(1);
    expect(clampConfidence(-1, ev(), "cat-transit")).toBe(0);
  });

  it("still caps an unretrieved row that the model was falsely certain about", () => {
    expect(clampConfidence(1, ev({ neighbourCount: 0, topNeighbourCategoryId: null }), null)).toBeLessThan(0.6);
  });

  it("treats agreeing on 'no category' as agreement", () => {
    const c = clampConfidence(0.7, ev({ topOverlap: 0.9, topNeighbourCategoryId: null }), null);
    expect(c).toBeGreaterThanOrEqual(0.95);
  });
});
