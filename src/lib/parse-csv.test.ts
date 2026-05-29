import { describe, expect, it } from "vitest";
import { parseAmount, parseCsv, parseDate } from "./parse-csv";

const SAMPLE = `Bokföringsdatum;Valutadatum;Verifikationsnummer;Text;Belopp;Saldo
2025-04-01;2025-04-01;100233;Hyra April;-12 500,00;11 478,00
2025-04-02;2025-04-02;100235;ICA Maxi Haninge;-487,00;10 991,00`;

describe("parseCsv", () => {
  it("detects a semicolon delimiter and parses headers + rows", () => {
    const p = parseCsv(SAMPLE);
    expect(p.headers).toHaveLength(6);
    expect(p.rows).toHaveLength(2);
    expect(p.rows[0][3]).toBe("Hyra April");
  });

  it("auto-detects date / description / amount columns by header", () => {
    const p = parseCsv(SAMPLE);
    expect(p.mapping).toEqual({ date: 0, description: 3, amount: 4 });
  });
});

describe("parseAmount", () => {
  it("handles Swedish formatting (unicode minus, space thousands, comma decimal)", () => {
    expect(parseAmount("−12 500,00")).toBe(-12500);
    expect(parseAmount("38 500,00")).toBe(38500);
    expect(parseAmount("-970")).toBe(-970);
    expect(parseAmount("1 234,56")).toBeCloseTo(1234.56);
  });
});

describe("parseDate", () => {
  it("keeps ISO and converts dd/mm/yyyy", () => {
    expect(parseDate("2025-04-01")).toBe("2025-04-01");
    expect(parseDate("01/04/2025")).toBe("2025-04-01");
  });
});
