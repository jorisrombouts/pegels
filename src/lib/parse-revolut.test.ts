import { describe, expect, it } from "vitest";
import { parseCsv } from "./parse-csv";
import { isRevolutCsv, normalizeRevolut } from "./parse-revolut";

const REVOLUT_SAMPLE = `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
Topup,Current,2026-01-01 12:30:52,2026-01-01 12:30:53,Apple Pay top-up by *2575,500.00,0.00,SEK,COMPLETED,500.00
Exchange,Current,2026-01-01 12:31:03,2026-01-01 12:31:03,Exchanged to EUR,-500.00,0.00,SEK,COMPLETED,0.00
Transfer,Current,2026-01-02 17:26:48,2026-01-05 10:39:49,International Transfer to Joris Rombouts,-8004.43,0.00,SEK,COMPLETED,0.00
Charge,Current,2026-01-23 02:16:10,2026-01-23 02:16:10,Premium plan fee,0.00,104.99,SEK,COMPLETED,-104.99
Card Payment,Current,2026-01-25 01:00:00,2026-01-26 14:07:10,SL,-43.00,0.00,SEK,COMPLETED,-0.99
Card Payment,Current,2026-02-01 02:13:06,,SL,-43.00,0.00,SEK,REVERTED,
Card Payment,Current,2026-02-05 10:00:00,2026-02-05 10:00:00,Hotel Madrid,-100.00,2.00,SEK,COMPLETED,-102.00
Cashback,Current,2026-02-06 10:00:00,2026-02-06 10:00:00,Reward bonus,5.00,0.00,SEK,COMPLETED,5.00`;

const SEB_SAMPLE = `Bokföringsdatum;Valutadatum;Verifikationsnummer;Text;Belopp;Saldo
2025-04-01;2025-04-01;100233;Hyra April;-12 500,00;11 478,00`;

const byDesc = (rows: ReturnType<typeof normalizeRevolut>, q: string) =>
  rows.find((r) => r.description.includes(q));

describe("isRevolutCsv", () => {
  it("detects a Revolut header", () => {
    expect(isRevolutCsv(parseCsv(REVOLUT_SAMPLE).headers)).toBe(true);
  });

  it("rejects a SEB header", () => {
    expect(isRevolutCsv(parseCsv(SEB_SAMPLE).headers)).toBe(false);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(isRevolutCsv([" TYPE ", "Amount", "fee", "STATE", "Description"])).toBe(true);
  });
});

describe("normalizeRevolut", () => {
  const rows = normalizeRevolut(parseCsv(REVOLUT_SAMPLE));

  it("drops top-ups and exchanges and keeps the rest", () => {
    // 8 data rows − Topup − Exchange − the REVERTED row = 5
    expect(rows).toHaveLength(5);
    expect(byDesc(rows, "Apple Pay top-up")).toBeUndefined();
    expect(byDesc(rows, "Exchanged to EUR")).toBeUndefined();
  });

  it("drops non-COMPLETED rows (the reverted SL leaves one SL)", () => {
    expect(rows.filter((r) => r.description === "SL")).toHaveLength(1);
  });

  it("keeps a Transfer as a transfer (not counted as spending)", () => {
    const t = byDesc(rows, "International Transfer");
    expect(t).toMatchObject({ kind: "transfer", amount: -8004.43, date: "2026-01-02" });
  });

  it("folds the Fee into the amount", () => {
    expect(byDesc(rows, "Premium plan fee")).toMatchObject({ kind: "expense", amount: -104.99 });
    expect(byDesc(rows, "Hotel Madrid")).toMatchObject({ kind: "expense", amount: -102 });
    expect(byDesc(rows, "SL")).toMatchObject({ kind: "expense", amount: -43 });
  });

  it("leaves an unknown Type's kind null for the caller to sign-fall-back", () => {
    expect(byDesc(rows, "Reward bonus")).toMatchObject({ kind: null, amount: 5 });
  });

  it("detects and normalizes a Dutch-language Revolut export", () => {
    // Real header + rows from a Dutch (nl) Revolut account statement.
    const nl = `Type,Product,Startdatum,Datum voltooid,Beschrijving,Bedrag,Kosten,Valuta,Status,Saldo
Wisselen,Betaalrekening,2026-03-05 21:44:31,2026-03-05 21:44:31,Gewisseld naar EUR,251.00,0.00,EUR,VOLTOOID,251.00
Geld toevoegen,Betaalrekening,2026-01-17 10:41:37,2026-01-17 10:41:39,xPay top-up,500.00,0.00,EUR,VOLTOOID,500.00
Overschrijving,Betaalrekening,2026-03-05 21:44:44,2026-03-05 21:44:46,To Katherine Ospina Morales,-251.00,0.00,EUR,VOLTOOID,0.00
Kaartbetaling,Betaalrekening,2026-03-10 10:00:00,2026-03-10 10:00:00,Mercadona,-30.00,0.50,EUR,VOLTOOID,0.00
Overschrijving,Betaalrekening,2026-02-01 02:13:06,,Pending,-10.00,0.00,EUR,WACHT,0.00`;
    const parsed = parseCsv(nl);
    expect(isRevolutCsv(parsed.headers)).toBe(true);

    const out = normalizeRevolut(parsed);
    // Drops the exchange (Wisselen) and top-up (Geld toevoegen); the non-completed (WACHT) row is gone too.
    expect(out).toHaveLength(2);
    expect(byDesc(out, "Gewisseld")).toBeUndefined();
    expect(byDesc(out, "xPay")).toBeUndefined();
    expect(byDesc(out, "Pending")).toBeUndefined();

    // EUR is read from the Valuta column (so it can later be converted to SEK).
    const katherine = byDesc(out, "Katherine");
    expect(katherine).toMatchObject({ currency: "EUR", amount: -251, kind: "transfer", date: "2026-03-05" });
    // Kaartbetaling → expense, with the Kosten (fee) folded in.
    expect(byDesc(out, "Mercadona")).toMatchObject({ currency: "EUR", amount: -30.5, kind: "expense" });
  });

  it("reads the Currency column for each row (defaults to SEK if missing)", () => {
    const sample = `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
Card Payment,Current,2026-02-05 10:00:00,2026-02-05 10:00:00,Hotel Madrid,-100.00,0.00,eur,COMPLETED,-100.00
Card Payment,Current,2026-01-25 01:00:00,2026-01-26 14:07:10,SL Stockholm,-43.00,0.00,SEK,COMPLETED,-0.99`;
    const out = normalizeRevolut(parseCsv(sample));
    expect(byDesc(out, "Hotel Madrid")?.currency).toBe("EUR"); // upper-cased
    expect(byDesc(out, "SL Stockholm")?.currency).toBe("SEK");
  });
});
