import { describe, expect, it } from "vitest";
import { categorize } from "./categorize";

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
