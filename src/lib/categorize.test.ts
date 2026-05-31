import { describe, expect, it } from "vitest";
import { categorize, matchesOwnAccount, needsReview } from "./categorize";

describe("categorize", () => {
  it("matches known merchants with high confidence", () => {
    expect(categorize("ICA Maxi Haninge").categoryId).toBe("cat-groceries");
    expect(categorize("Spotify AB").categoryId).toBe("cat-entertainment");
    expect(categorize("Hyra April").categoryId).toBe("cat-rent");
    expect(categorize("ICA Maxi Haninge").confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("falls back to Other with low confidence for unknown text", () => {
    const g = categorize("Lön Företaget AB");
    expect(g.categoryId).toBe("cat-other");
    expect(g.confidence).toBeLessThan(0.6);
  });
});

describe("matchesOwnAccount", () => {
  it("matches a description referencing an own account number, ignoring spaces", () => {
    expect(matchesOwnAccount("Överföring 99887766554", ["99887766554"])).toBe(true);
    expect(matchesOwnAccount("Insättning 9988 7766554", ["99887766554"])).toBe(true);
    expect(matchesOwnAccount("Från 99887766554", ["9988 7766554"])).toBe(true);
  });

  it("does not match unrelated descriptions or empty number lists", () => {
    expect(matchesOwnAccount("ICA SUPERMARKET", ["99887766554"])).toBe(false);
    expect(matchesOwnAccount("Överföring 99887766554", [])).toBe(false);
    expect(matchesOwnAccount("Överföring 99887766554", [""])).toBe(false);
  });
});

describe("needsReview", () => {
  it("flags low-confidence guesses", () => {
    expect(needsReview(0.4)).toBe(true);
    expect(needsReview(0.93)).toBe(false);
  });
});
