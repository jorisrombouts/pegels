import { describe, expect, it } from "vitest";
import { stableHash } from "./hash";

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
