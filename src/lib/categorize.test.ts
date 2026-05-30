import { describe, expect, it } from "vitest";
import { categorize, classifyRules, needsReview } from "./categorize";

describe("categorize", () => {
  it("matches known merchants with high confidence", () => {
    expect(categorize("ICA Maxi Haninge").categoryId).toBe("cat-groceries");
    expect(categorize("Spotify AB").categoryId).toBe("cat-subscriptions");
    expect(categorize("Hyra April").categoryId).toBe("cat-rent");
    expect(categorize("ICA Maxi Haninge").confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("falls back to Other with low confidence for unknown text", () => {
    const g = categorize("Lön Företaget AB");
    expect(g.categoryId).toBe("cat-other");
    expect(g.confidence).toBeLessThan(0.6);
  });
});

describe("classifyRules", () => {
  it("maps card/transfer providers to transfer", () => {
    expect(classifyRules("REVOLUT 629")).toEqual({ kind: "transfer", categoryId: null });
    expect(classifyRules("SEB Kort Bank")).toEqual({ kind: "transfer", categoryId: null });
    expect(classifyRules("American Express")).toEqual({ kind: "transfer", categoryId: null });
    expect(classifyRules("AMEX payment")).toEqual({ kind: "transfer", categoryId: null });
    expect(classifyRules("Avanza Bank")).toEqual({ kind: "transfer", categoryId: null });
  });

  it("maps LÖN to income and LÅN to mortgage expense", () => {
    expect(classifyRules("LÖN")).toEqual({ kind: "income", categoryId: null });
    expect(classifyRules("Bolån Nordea")).toEqual({ kind: "expense", categoryId: "cat-mortgage" });
  });

  it("returns null when no rule applies", () => {
    expect(classifyRules("ICA SUPERMAR")).toBeNull();
  });
});

describe("needsReview", () => {
  it("flags low-confidence guesses", () => {
    expect(needsReview(0.4)).toBe(true);
    expect(needsReview(0.93)).toBe(false);
  });
});
