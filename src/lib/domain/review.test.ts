import { describe, expect, it } from "vitest";
import { needsReview } from "./review";

describe("needsReview", () => {
  it("flags low-confidence guesses", () => {
    expect(needsReview(0.4)).toBe(true);
    expect(needsReview(0.93)).toBe(false);
  });
});
