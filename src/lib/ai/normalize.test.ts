import { describe, expect, it } from "vitest";
import { normalizeMerchant } from "./normalize";

describe("normalizeMerchant", () => {
  it("is stable across the reference numbers a bank appends", () => {
    expect(normalizeMerchant("ICA MAXI HANINGE 4711")).toBe(normalizeMerchant("ICA MAXI HANINGE"));
    expect(normalizeMerchant("SPOTIFY AB /25-03-14")).toBe(normalizeMerchant("SPOTIFY AB"));
  });

  it("is case- and whitespace-insensitive", () => {
    expect(normalizeMerchant("  Ica   Maxi  ")).toBe(normalizeMerchant("ICA MAXI"));
  });

  it("keeps the whole merchant name, unlike the forecast's 3-token key", () => {
    // Two ICA stores are different merchants and must not collapse into one corpus row.
    expect(normalizeMerchant("ICA MAXI HANINGE")).not.toBe(normalizeMerchant("ICA NÄRA VASASTAN"));
    expect(normalizeMerchant("ALPHA BETA GAMMA DELTA")).toBe("alpha beta gamma delta");
  });

  it("drops the month suffix so a monthly bill is one merchant", () => {
    expect(normalizeMerchant("HYRA APRIL")).toBe(normalizeMerchant("HYRA MARS"));
  });

  it("drops bank chrome that describes how the money moved", () => {
    expect(normalizeMerchant("KORTKÖP SPOTIFY")).toBe(normalizeMerchant("SPOTIFY"));
  });

  it("returns an empty string when nothing identifying is left", () => {
    expect(normalizeMerchant("   4711  ")).toBe("");
  });
});
