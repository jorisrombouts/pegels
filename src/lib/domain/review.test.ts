import { describe, expect, it } from "vitest";
import { needsReview } from "./review";

describe("needsReview", () => {
  it("flags a merchant the system has never seen", () => {
    expect(needsReview("low")).toBe(true);
  });

  it("does not flag a prediction backed by evidence", () => {
    // "medium" means retrieval found something. That is not certainty, but it is not a blank
    // either, and flagging it would bury the rows that genuinely need a human.
    expect(needsReview("medium")).toBe(false);
    expect(needsReview("high")).toBe(false);
  });
});
