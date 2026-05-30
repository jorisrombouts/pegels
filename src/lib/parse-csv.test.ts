import { describe, expect, it } from "vitest";
import { cleanDescription, parseAmount, parseCsv, parseDate } from "./parse-csv";

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

  it("handles SEB dot-decimal amounts (up to 3 trailing decimals)", () => {
    expect(parseAmount("-3000.000")).toBe(-3000);
    expect(parseAmount("-188.750")).toBe(-188.75);
    expect(parseAmount("-29865.970")).toBe(-29865.97);
    expect(parseAmount("61240.000")).toBe(61240);
  });

  it("keeps Swedish-comma cases working", () => {
    expect(parseAmount("−12 500,00")).toBe(-12500);
    expect(parseAmount("1 234,56")).toBe(1234.56);
  });
});

describe("cleanDescription", () => {
  it("strips trailing /YY-MM-DD dates and collapses whitespace", () => {
    expect(cleanDescription("ICA SUPERMAR/26-03-25")).toBe("ICA SUPERMAR");
    expect(cleanDescription("SL          /26-03-12")).toBe("SL");
    expect(cleanDescription("REVOLUT  629/26-05-29")).toBe("REVOLUT 629");
    expect(cleanDescription("LÖN")).toBe("LÖN");
    expect(cleanDescription("SEB KORT BANK AB")).toBe("SEB KORT BANK AB");
  });
});

describe("parseDate", () => {
  it("keeps ISO and converts dd/mm/yyyy", () => {
    expect(parseDate("2025-04-01")).toBe("2025-04-01");
    expect(parseDate("01/04/2025")).toBe("2025-04-01");
  });
});
