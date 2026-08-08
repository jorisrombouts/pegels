import { describe, expect, it } from "vitest";
import { merchantTokens, tokenOverlap } from "./merchant-tokens";

describe("merchantTokens", () => {
  it("lowercases and keeps Swedish letters", () => {
    expect(merchantTokens("HEMKÖP Södermalm")).toEqual(["hemköp", "södermalm"]);
  });

  it("drops digits and short tokens", () => {
    expect(merchantTokens("ICA MAXI 4711 AB")).toEqual(["ica", "maxi"]);
  });

  it("returns nothing for a description with no words", () => {
    expect(merchantTokens("4711 / 22")).toEqual([]);
  });
});

describe("tokenOverlap", () => {
  const set = (s: string) => new Set(merchantTokens(s));

  it("is 1 for identical token sets", () => {
    expect(tokenOverlap(set("ICA MAXI"), merchantTokens("ICA MAXI"))).toBe(1);
  });

  it("is 0 when nothing is shared", () => {
    expect(tokenOverlap(set("ICA MAXI"), merchantTokens("SPOTIFY AB"))).toBe(0);
  });

  it("scores a partial match between 0 and 1", () => {
    const score = tokenOverlap(set("ICA MAXI HANINGE"), merchantTokens("ICA MAXI VASASTAN"));
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it("is 0 rather than NaN when either side is empty", () => {
    expect(tokenOverlap(new Set(), merchantTokens("ICA"))).toBe(0);
    expect(tokenOverlap(set("ICA"), [])).toBe(0);
  });
});
