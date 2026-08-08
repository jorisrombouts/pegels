import { describe, expect, it } from "vitest";
import { CONFIDENCE_LEVELS, gradeConfidence, type RetrievalEvidence } from "./confidence";

const ev = (o: Partial<RetrievalEvidence> = {}): RetrievalEvidence => ({
  neighbourCount: 3,
  topOverlap: 0.4,
  topNeighbourCategoryId: "cat-groceries",
  ...o,
});

describe("gradeConfidence — the level", () => {
  it("is low when retrieval found nothing at all", () => {
    // "The system has never seen this merchant" is the thing worth surfacing, and the only
    // statement here that is actually grounded in fact rather than the model's self-report.
    const g = gradeConfidence(0.95, ev({ neighbourCount: 0, topNeighbourCategoryId: null }), "cat-groceries");
    expect(g.level).toBe("low");
  });

  it("is high when a near-identical merchant agrees with the answer", () => {
    expect(gradeConfidence(0.7, ev({ topOverlap: 0.9 }), "cat-groceries").level).toBe("high");
  });

  it("is only medium when the model disagreed with its closest match", () => {
    // High overlap but a different answer is a genuine conflict, not a settled merchant.
    expect(gradeConfidence(0.9, ev({ topOverlap: 0.9 }), "cat-restaurants").level).toBe("medium");
  });

  it("is medium when evidence exists but nothing matches closely", () => {
    expect(gradeConfidence(0.8, ev({ topOverlap: 0.3 }), "cat-groceries").level).toBe("medium");
  });

  it("treats agreeing on 'no category' as agreement", () => {
    const g = gradeConfidence(0.7, ev({ topOverlap: 0.9, topNeighbourCategoryId: null }), null);
    expect(g.level).toBe("high");
  });

  it("cannot be talked into high by a self-assured model alone", () => {
    // The model claiming 1.0 with nothing to back it is exactly the case that used to render as
    // a reassuring "100%".
    expect(gradeConfidence(1, ev({ neighbourCount: 0, topNeighbourCategoryId: null }), null).level).toBe("low");
  });
});

describe("gradeConfidence — the score kept for measurement", () => {
  it("still reports a number so calibration stays measurable", () => {
    expect(typeof gradeConfidence(0.72, ev(), "cat-transit").score).toBe("number");
  });

  it("keeps the score in range whatever the model returned", () => {
    expect(gradeConfidence(4, ev(), "cat-transit").score).toBe(1);
    expect(gradeConfidence(-1, ev(), "cat-transit").score).toBe(0);
  });

  it("floors a low row below the review threshold", () => {
    expect(gradeConfidence(0.99, ev({ neighbourCount: 0, topNeighbourCategoryId: null }), null).score).toBeLessThan(0.6);
  });

  it("raises a high row above it", () => {
    expect(gradeConfidence(0.7, ev({ topOverlap: 0.9 }), "cat-groceries").score).toBeGreaterThanOrEqual(0.95);
  });
});

describe("CONFIDENCE_LEVELS", () => {
  it("orders levels from least to most certain, so a UI can rank them", () => {
    expect(CONFIDENCE_LEVELS).toEqual(["low", "medium", "high"]);
  });
});
