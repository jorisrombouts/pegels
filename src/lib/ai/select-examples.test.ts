import { describe, expect, it } from "vitest";
import { merchantTokens, selectExamples, type ExampleRow } from "./select-examples";

const ex = (cleanedDescription: string, finalCategoryId: string | null): ExampleRow => ({
  cleanedDescription,
  finalKind: "expense",
  finalCategoryId,
});

describe("merchantTokens", () => {
  it("lowercases letter tokens, drops numbers and short tokens", () => {
    expect(merchantTokens("ICA MAXI STORGATAN 123")).toEqual(["ica", "maxi", "storgatan"]);
  });
  it("drops digit runs entirely", () => {
    expect(merchantTokens("Swish 070-1234567")).toEqual(["swish"]);
  });
  it("returns nothing for a too-short merchant", () => {
    expect(merchantTokens("SL")).toEqual([]);
  });
});

describe("selectExamples", () => {
  it("puts corrections relevant to the batch first", () => {
    const corrected = [ex("SPOTIFY", "cat-ent"), ex("ICA MAXI", "cat-groceries")];
    const out = selectExamples({ rows: [{ description: "ICA NORR" }], corrected, recent: [] });
    expect(out.map((e) => e.cleanedDescription)).toEqual(["ICA MAXI", "SPOTIFY"]);
  });

  it("orders relevant-corrected, then other corrected, then recent", () => {
    const out = selectExamples({
      rows: [{ description: "ICA" }],
      corrected: [ex("BOLT", "cat-transport"), ex("ICA CITY", "cat-groceries")],
      recent: [ex("RECENT", "cat-other")],
    });
    expect(out.map((e) => e.cleanedDescription)).toEqual(["ICA CITY", "BOLT", "RECENT"]);
  });

  it("dedupes by description + kind + category, keeping the first", () => {
    const out = selectExamples({
      rows: [],
      corrected: [ex("ICA MAXI", "cat-groceries"), ex("ica maxi", "cat-groceries")],
      recent: [],
    });
    expect(out).toHaveLength(1);
  });

  it("caps at the limit", () => {
    const corrected = [ex("A SHOP", "c1"), ex("B SHOP", "c2"), ex("C SHOP", "c3")];
    expect(selectExamples({ rows: [], corrected, recent: [], limit: 2 })).toHaveLength(2);
  });

  it("falls back to recent when there are no corrections (cold start)", () => {
    const out = selectExamples({ rows: [{ description: "ICA" }], corrected: [], recent: [ex("ICA", "cat-groceries")] });
    expect(out.map((e) => e.cleanedDescription)).toEqual(["ICA"]);
  });
});
