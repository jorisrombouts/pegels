import { describe, expect, it } from "vitest";
import { detectRecurring } from "./recurring";
import type { Split, Transaction } from "@/lib/domain/types";

let seq = 0;
function makeTx(date: string, description: string, amount: number, o: Partial<Transaction> = {}): Transaction {
  return {
    id: `t-${++seq}`,
    date,
    description,
    amount,
    accountId: "acc-1",
    categoryId: "cat-housing",
    predictedCategoryId: null,
    categoryConfidence: null,
    categorySource: "user",
    needsReview: false,
    tagIds: [],
    kind: "expense",
    ...o,
  };
}

/** One charge per month on `day`, for the given yyyy-mm keys. */
function monthly(keys: string[], description: string, amount: number | number[], day = 1, o: Partial<Transaction> = {}) {
  return keys.map((k, i) =>
    makeTx(`${k}-${String(day).padStart(2, "0")}`, description, Array.isArray(amount) ? amount[i] : amount, o),
  );
}

const H1 = ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06"];
const CURRENT = "2025-07";

describe("detectRecurring", () => {
  it("detects rent billed on the 1st every month", () => {
    const rent = monthly(H1, "HYRA MARS", -12500);
    const [charge, ...rest] = detectRecurring(rent, CURRENT);
    expect(rest).toHaveLength(0);
    expect(charge.key).toBe("hyra");
    expect(charge.typicalAmount).toBe(12500);
    expect(charge.typicalDay).toBe(1);
    expect(charge.occurrences).toBe(6);
    expect(charge.distinctMonths).toBe(6);
    expect(charge.categoryId).toBe("cat-housing");
    expect(charge.confidence).toBeCloseTo(1);
  });

  it("collapses the month suffix so HYRA MARS and HYRA APRIL are one charge", () => {
    const rent = H1.map((k, i) => makeTx(`${k}-01`, `HYRA ${["JAN", "FEB", "MARS", "APRIL", "MAJ", "JUNI"][i]}`, -12500));
    expect(detectRecurring(rent, CURRENT)).toHaveLength(1);
  });

  it("tracks a price change through to typicalAmount while staying recurring", () => {
    // Rent rises in May. MAD is robust to the minority, so it stays recurring — and the
    // forecast must use the NEW price, not the historical median.
    const rent = monthly(H1, "HYRA", [-12500, -12500, -12500, -12500, -13200, -13200]);
    const [charge] = detectRecurring(rent, CURRENT);
    expect(charge.typicalAmount).toBe(13200);
  });

  it("measures a split charge by the mine portion only", () => {
    const splits: Split[] = [
      { id: "s1", amount: 6250, mine: true },
      { id: "s2", amount: 6250, mine: false },
    ];
    const rent = monthly(H1, "HYRA", -12500, 1, { splits });
    const [charge] = detectRecurring(rent, CURRENT);
    expect(charge.typicalAmount).toBe(6250);
  });

  it("rejects a charge seen in fewer than three distinct months", () => {
    const burst = [
      makeTx("2025-06-03", "SYSTEMBOLAGET", -400),
      makeTx("2025-06-14", "SYSTEMBOLAGET", -400),
      makeTx("2025-06-22", "SYSTEMBOLAGET", -400),
    ];
    expect(detectRecurring(burst, CURRENT)).toHaveLength(0);
  });

  it("rejects a charge that fires far more often than monthly", () => {
    // A daily coffee is perfectly stable in amount but is not a recurring bill.
    const coffee = ["2025-04", "2025-05", "2025-06"].flatMap((k) =>
      Array.from({ length: 7 }, (_, i) => makeTx(`${k}-${String(i + 1).padStart(2, "0")}`, "ESPRESSO HOUSE", -45)),
    );
    expect(detectRecurring(coffee, CURRENT)).toHaveLength(0);
  });

  it("rejects a charge whose amount is unstable", () => {
    const groceries = monthly(["2025-04", "2025-05", "2025-06"], "ICA MAXI", [-487, -1650, -230]);
    expect(detectRecurring(groceries, CURRENT)).toHaveLength(0);
  });

  it("rejects a charge whose day of month wanders", () => {
    const wandering = [
      makeTx("2025-04-02", "SWISH KALLE", -500),
      makeTx("2025-05-19", "SWISH KALLE", -500),
      makeTx("2025-06-27", "SWISH KALLE", -500),
    ];
    expect(detectRecurring(wandering, CURRENT)).toHaveLength(0);
  });

  it("ignores income, transfers and excluded rows", () => {
    const notSpend = [
      ...monthly(H1, "LÖN", 38500, 25, { kind: "income" }),
      ...monthly(H1, "TILL SPARKONTO", -3000, 26, { kind: "transfer" }),
      ...monthly(H1, "GAMMAL PRENUMERATION", -99, 5, { excluded: true }),
    ];
    expect(detectRecurring(notSpend, CURRENT)).toHaveLength(0);
  });

  it("ignores the current month, so detection is stable within a month", () => {
    // Only 2 completed months of history — the current month's charge must not top it up to 3.
    const tooNew = [...monthly(["2025-05", "2025-06"], "NETFLIX", -139), makeTx("2025-07-01", "NETFLIX", -139)];
    expect(detectRecurring(tooNew, CURRENT)).toHaveLength(0);
  });

  it("drops a charge that falls outside the lookback window", () => {
    const old = monthly(["2024-06", "2024-07", "2024-08"], "GAMMAL TIDNING", -199);
    expect(detectRecurring(old, CURRENT)).toHaveLength(0);
  });

  it("scores partial-coverage charges below full-coverage ones", () => {
    const full = monthly(H1, "HYRA", -12500);
    const partial = monthly(["2025-04", "2025-05", "2025-06"], "TIDNING", -199, 3);
    const charges = detectRecurring([...full, ...partial], CURRENT);
    const byKey = new Map(charges.map((c) => [c.key, c]));
    expect(byKey.get("tidning")!.confidence).toBeLessThan(byKey.get("hyra")!.confidence);
  });
});
