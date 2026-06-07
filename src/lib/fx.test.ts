import { describe, expect, it } from "vitest";
import { invertToSEK, convertRowsToSEK, foreignCurrencies } from "./fx";
import type { RevolutRow } from "./parse-revolut";

const row = (over: Partial<RevolutRow>): RevolutRow => ({
  date: "2026-02-05",
  description: "x",
  amount: -100,
  currency: "EUR",
  kind: "expense",
  ...over,
});

describe("invertToSEK", () => {
  it("inverts SEK-base rates to <currency>→SEK and includes SEK:1", () => {
    expect(invertToSEK({ EUR: 0.1, USD: 0.05 })).toEqual({ EUR: 10, USD: 20, SEK: 1 });
  });
});

describe("convertRowsToSEK", () => {
  it("converts non-SEK rows, rounds to öre, and records the original in fxNote", () => {
    const { rows, unconvertedCurrencies } = convertRowsToSEK(
      [row({ description: "Hotel", amount: -102, currency: "EUR" })],
      { EUR: 11.5, SEK: 1 },
    );
    expect(rows[0].amount).toBe(-1173); // -102 * 11.5
    expect(rows[0].fxNote).toBe("-102.00 EUR @ 11.5");
    expect(unconvertedCurrencies).toEqual([]);
  });

  it("rounds a fractional conversion to 2 decimals", () => {
    const { rows } = convertRowsToSEK([row({ amount: -10, currency: "EUR" })], { EUR: 10.8672, SEK: 1 });
    expect(rows[0].amount).toBe(-108.67); // -10 * 10.8672 = -108.672
  });

  it("passes SEK rows through untouched (no fxNote)", () => {
    const { rows } = convertRowsToSEK([row({ description: "SL", amount: -43, currency: "SEK" })], { EUR: 11.5, SEK: 1 });
    expect(rows[0].amount).toBe(-43);
    expect(rows[0].fxNote).toBeUndefined();
  });

  it("flags rows whose currency has no rate as unconverted and leaves the amount alone", () => {
    const { rows, unconvertedCurrencies } = convertRowsToSEK([row({ description: "NYC", amount: -50, currency: "USD" })], { SEK: 1 });
    expect(rows[0].unconverted).toBe(true);
    expect(rows[0].amount).toBe(-50);
    expect(unconvertedCurrencies).toEqual(["USD"]);
  });
});

describe("foreignCurrencies", () => {
  it("returns the distinct non-SEK currencies in order of first appearance", () => {
    const rows = [row({ currency: "EUR" }), row({ currency: "SEK" }), row({ currency: "EUR" }), row({ currency: "USD" })];
    expect(foreignCurrencies(rows)).toEqual(["EUR", "USD"]);
  });

  it("returns empty when every row is SEK", () => {
    expect(foreignCurrencies([row({ currency: "SEK" })])).toEqual([]);
  });
});
