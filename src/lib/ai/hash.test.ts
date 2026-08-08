import { describe, expect, it } from "vitest";
import { isGoldByHash, stableHash } from "./hash";

describe("stableHash", () => {
  it("is deterministic across calls", () => {
    expect(stableHash("ex-abc")).toBe(stableHash("ex-abc"));
  });

  it("separates similar inputs", () => {
    expect(stableHash("ex-abc")).not.toBe(stableHash("ex-abd"));
  });

  it("is a non-negative 32-bit integer", () => {
    for (const s of ["", "a", "ICA MAXI", "ex-0000-1111"]) {
      const h = stableHash(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
  });
});

describe("isGoldByHash", () => {
  const ids = Array.from({ length: 4000 }, (_, i) => `ex-${i}`);

  it("holds out roughly the requested percentage", () => {
    const share = ids.filter((id) => isGoldByHash(id)).length / ids.length;
    expect(share).toBeGreaterThan(0.16);
    expect(share).toBeLessThan(0.24);
  });

  it("honours a custom percentage", () => {
    const share = ids.filter((id) => isGoldByHash(id, 50)).length / ids.length;
    expect(share).toBeGreaterThan(0.45);
    expect(share).toBeLessThan(0.55);
  });

  it("is stable for a given id, so the holdout doesn't drift between runs", () => {
    expect(isGoldByHash("ex-42")).toBe(isGoldByHash("ex-42"));
  });

  it("selects nobody at 0 and everybody at 100", () => {
    expect(ids.some((id) => isGoldByHash(id, 0))).toBe(false);
    expect(ids.every((id) => isGoldByHash(id, 100))).toBe(true);
  });
});
