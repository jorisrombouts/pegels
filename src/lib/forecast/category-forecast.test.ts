import { describe, expect, it } from "vitest";
import { categoryForecasts, forecastForCategory, monthForecast } from "./category-forecast";
import { buildMaps } from "@/lib/domain/selectors";
import type { Budget, Category, Split, Transaction } from "@/lib/domain/types";

const CATEGORIES: Category[] = [
  { id: "cat-housing", name: "Housing", icon: "🏠", color: "0 0% 0%", parentId: null },
  { id: "cat-food", name: "Food", icon: "🍽", color: "0 0% 0%", parentId: null },
  { id: "cat-groceries", name: "Groceries", icon: "🛒", color: "0 0% 0%", parentId: "cat-food" },
];
const maps = buildMaps(CATEGORIES);

let seq = 0;
function makeTx(date: string, description: string, amount: number, categoryId: string | null, o: Partial<Transaction> = {}): Transaction {
  return {
    id: `t-${++seq}`,
    date,
    description,
    amount,
    accountId: "acc-1",
    categoryId,
    predictedCategoryId: null,
    categoryConfidence: null,
    categorySource: "user",
    needsReview: false,
    tagIds: [],
    kind: "expense",
    ...o,
  };
}

const HISTORY = ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06"];
const KEY = "2025-07";
const DAY_3 = new Date(2025, 6, 3);
const DAY_6 = new Date(2025, 6, 6);
const DAY_10 = new Date(2025, 6, 10);

/** Rent on the 1st, every month of HISTORY. */
const rentHistory = HISTORY.map((k) => makeTx(`${k}-01`, "HYRA", -12500, "cat-housing"));

describe("forecastForCategory — the fixed/variable split", () => {
  it("counts a landed fixed cost once instead of extrapolating it across the month", () => {
    // The bug this whole engine exists to fix: on day 3, (spent/daysElapsed)*daysInMonth turns
    // one 12 500 kr rent into ~129 000 kr.
    const txs = [...rentHistory, makeTx("2025-07-01", "HYRA", -12500, "cat-housing")];
    const f = forecastForCategory(txs, maps, "cat-housing", KEY, { today: DAY_3 });

    expect(f.landed).toBe(12500);
    expect(f.recurringLanded).toBe(12500);
    expect(f.variableLanded).toBe(0);
    expect(f.recurringExpected).toBe(0);
    expect(f.projected).toBe(12500);
  });

  it("extrapolates only the variable part, and only over the remaining days", () => {
    // Housing history: rent (recurring) + an irregular repair (variable, so it must not be
    // detected as recurring — amounts and days both wander).
    const repairs = [
      makeTx("2025-04-19", "BAUHAUS", -2100, "cat-housing"),
      makeTx("2025-05-03", "HORNBACH", -2000, "cat-housing"),
      makeTx("2025-06-22", "JULA", -2000, "cat-housing"),
    ];
    const txs = [
      ...rentHistory,
      ...repairs,
      makeTx("2025-07-01", "HYRA", -12500, "cat-housing"),
      makeTx("2025-07-02", "CLAS OHLSON", -300, "cat-housing"),
    ];
    const f = forecastForCategory(txs, maps, "cat-housing", KEY, { today: DAY_3 });

    expect(f.recurringLanded).toBe(12500);
    expect(f.variableLanded).toBe(300);
    expect(f.variablePace).toBeCloseTo(100); // 300 over 3 elapsed days
    expect(f.baseline).toBe(14500); // median of Apr/May/Jun = 14600 / 14500 / 14500

    // w = daysLeft/daysInMonth = 28/31. variableBaseline = 14500 - 12500 = 2000.
    // variableProjected = w*(2000*28/31) + (1-w)*(100*28) = 1631.63 + 270.97
    expect(f.variableProjected).toBeCloseTo(1902.6, 1);
    expect(f.projected).toBeCloseTo(14702.6, 1);
  });

  it("keeps a not-yet-landed recurring charge in the projection", () => {
    const spotify = HISTORY.map((k) => makeTx(`${k}-15`, "SPOTIFY AB", -139, "cat-food"));
    const f = forecastForCategory(spotify, maps, "cat-food", KEY, { today: DAY_10 });

    expect(f.recurringExpected).toBe(139);
    expect(f.recurringLanded).toBe(0);
    expect(f.recurringLate).toHaveLength(0); // the 15th hasn't arrived yet
    expect(f.projected).toBeCloseTo(139);
  });

  it("flags a recurring charge that is overdue but still counts it", () => {
    // Dropping a late charge makes the projection quietly optimistic — the worst failure mode.
    const f = forecastForCategory(rentHistory, maps, "cat-housing", KEY, { today: DAY_6 });

    expect(f.recurringLate.map((c) => c.key)).toEqual(["hyra"]);
    expect(f.recurringExpected).toBe(12500);
    expect(f.projected).toBe(12500);
  });

  it("does not double-count a recurring charge once it lands", () => {
    const before = forecastForCategory(rentHistory, maps, "cat-housing", KEY, { today: DAY_6 });
    const after = forecastForCategory(
      [...rentHistory, makeTx("2025-07-01", "HYRA", -12500, "cat-housing")],
      maps, "cat-housing", KEY, { today: DAY_6 },
    );
    expect(after.projected).toBeCloseTo(before.projected);
  });

  it("gives a daily allowance with the still-expected fixed charges already deducted", () => {
    // Food: a recurring 800 kr meal-kit on the 20th, plus variable groceries.
    const matkasse = HISTORY.map((k) => makeTx(`${k}-20`, "MATKASSE", -800, "cat-groceries"));
    const groceries = [
      makeTx("2025-04-07", "ICA MAXI", -2000, "cat-groceries"),
      makeTx("2025-05-16", "COOP FORUM", -2000, "cat-groceries"),
      makeTx("2025-06-24", "WILLYS", -2000, "cat-groceries"),
    ];
    const txs = [...matkasse, ...groceries, makeTx("2025-07-05", "ICA MAXI", -600, "cat-groceries")];
    const f = forecastForCategory(txs, maps, "cat-food", KEY, { today: DAY_10 });

    expect(f.baseline).toBe(2800);
    expect(f.recurringExpected).toBe(800);
    // (2800 target - 600 landed - 800 still coming) / 21 days left
    expect(f.dailyAllowance).toBeCloseTo(1400 / 21);
  });

  it("prefers a budget limit over the historical baseline as the allowance target", () => {
    const groceries = [
      makeTx("2025-04-07", "ICA MAXI", -2000, "cat-groceries"),
      makeTx("2025-05-16", "COOP FORUM", -2000, "cat-groceries"),
      makeTx("2025-06-24", "WILLYS", -2000, "cat-groceries"),
      makeTx("2025-07-05", "ICA MAXI", -600, "cat-groceries"),
    ];
    const budgets: Budget[] = [{ id: "b1", categoryId: "cat-food", limit: 3400, month: null }];
    const f = forecastForCategory(groceries, maps, "cat-food", KEY, { today: DAY_10, budgets });
    expect(f.dailyAllowance).toBeCloseTo((3400 - 600) / 21);
  });

  it("measures splits by the mine portion", () => {
    const splits: Split[] = [
      { id: "s1", amount: 400, mine: true },
      { id: "s2", amount: 400, mine: false },
    ];
    const txs = [makeTx("2025-07-02", "RESTAURANG", -800, "cat-food", { splits })];
    const f = forecastForCategory(txs, maps, "cat-food", KEY, { today: DAY_3 });
    expect(f.landed).toBe(400);
  });

  it("rolls subcategory spend up into the parent", () => {
    const txs = [makeTx("2025-07-02", "ICA MAXI", -500, "cat-groceries")];
    expect(forecastForCategory(txs, maps, "cat-food", KEY, { today: DAY_3 }).landed).toBe(500);
  });
});

describe("forecastForCategory — verdicts", () => {
  it("says there is no basis yet when there is no history and the month just started", () => {
    const txs = [makeTx("2025-07-02", "FLYGBILJETT", -4000, "cat-food")];
    const f = forecastForCategory(txs, maps, "cat-food", KEY, { today: new Date(2025, 6, 4) });
    expect(f.baseline).toBeNull();
    expect(f.verdict).toBe("no-basis");
    expect(f.dailyAllowance).toBeNull();
  });

  it("stops saying no-basis once enough of the month has elapsed to extrapolate", () => {
    const txs = [makeTx("2025-07-02", "FLYGBILJETT", -4000, "cat-food")];
    const f = forecastForCategory(txs, maps, "cat-food", KEY, { today: new Date(2025, 6, 20) });
    expect(f.verdict).not.toBe("no-basis");
  });

  it("calls an all-fixed category settled and offers no daily allowance", () => {
    // Rent is not something you can "spend 400/day less" on.
    const f = forecastForCategory(rentHistory, maps, "cat-housing", KEY, { today: DAY_10 });
    expect(f.verdict).toBe("settled");
    expect(f.dailyAllowance).toBeNull();
  });

  it("flags a category trending over its typical month", () => {
    const groceries = [
      makeTx("2025-04-07", "ICA MAXI", -2000, "cat-groceries"),
      makeTx("2025-05-16", "COOP FORUM", -2000, "cat-groceries"),
      makeTx("2025-06-24", "WILLYS", -2000, "cat-groceries"),
      makeTx("2025-07-02", "ICA MAXI", -1800, "cat-groceries"),
    ];
    const f = forecastForCategory(groceries, maps, "cat-food", KEY, { today: DAY_10 });
    expect(f.projected).toBeGreaterThan(2000 * 1.05);
    expect(f.verdict).toBe("trending-over");
  });

  it("treats a completed month as final", () => {
    const txs = [...rentHistory, makeTx("2025-06-14", "ICA MAXI", -500, "cat-food")];
    const f = forecastForCategory(txs, maps, "cat-food", "2025-06", { today: DAY_10 });
    expect(f.isProjected).toBe(false);
    expect(f.projected).toBe(f.landed);
    expect(f.dailyAllowance).toBeNull();
    expect(f.verdict).toBe("settled");
  });

  it("treats a future month as not started rather than complete", () => {
    const f = forecastForCategory(rentHistory, maps, "cat-housing", "2025-08", { today: DAY_10 });
    expect(f.landed).toBe(0);
    expect(f.recurringExpected).toBe(12500);
    expect(f.projected).toBe(12500);
  });
});

describe("categoryForecasts and monthForecast", () => {
  const txs = [
    ...rentHistory,
    makeTx("2025-07-01", "HYRA", -12500, "cat-housing"),
    makeTx("2025-07-02", "ICA MAXI", -500, "cat-groceries"),
  ];

  it("reports one row per top-level category with activity, biggest projection first", () => {
    const rows = categoryForecasts(txs, maps, CATEGORIES, KEY, { today: DAY_3 });
    expect(rows.map((r) => r.category.id)).toEqual(["cat-housing", "cat-food"]);
  });

  it("omits categories with no spend, no history and nothing expected", () => {
    const rows = categoryForecasts([makeTx("2025-07-02", "ICA MAXI", -500, "cat-groceries")], maps, CATEGORIES, KEY, { today: DAY_3 });
    expect(rows.map((r) => r.category.id)).toEqual(["cat-food"]);
  });

  it("monthForecast aggregates every category into one figure", () => {
    const all = monthForecast(txs, maps, KEY, { today: DAY_3 });
    expect(all.landed).toBe(13000);
    expect(all.recurringLanded).toBe(12500);
    expect(all.variableLanded).toBe(500);
    // Rent counted once — the old formula produced (13000/3)*31 ≈ 134 333.
    expect(all.projected).toBeLessThan(20000);
  });
});
