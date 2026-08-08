import { describe, expect, it } from "vitest";
import { budgetStatuses, buildMaps, categorySpendInMonth, categoryTrends, detectTransfersOnImport, earliestDataMonth, latestDataMonth, monthNet, monthProgress, orderCategories, spendBySubcategory, spendByTag, withDelta } from "./selectors";
import type { Budget, Category, Tag, Transaction } from "./types";

const food: Category = { id: "food", name: "Food", icon: "🍔", color: "150 60% 45%", parentId: null };
const maps = buildMaps([food]);

function tx(amount: number, o: Partial<Transaction> = {}): Transaction {
  return {
    id: `t${Math.random()}`, date: "2025-03-10", description: "x", amount, accountId: "a",
    categoryId: "food", predictedCategoryId: "food", categoryConfidence: 0.9, categoryLevel: null, categorySource: "model",
    needsReview: false, tagIds: [],
    kind: amount < 0 ? "expense" : "income", ...o,
  };
}

describe("orderCategories", () => {
  const cats: Category[] = [
    { id: "child", name: "Child", icon: "👕", color: "0 0% 0%", parentId: "parent" }, // appears BEFORE its parent
    { id: "other", name: "Other", icon: "📎", color: "0 0% 0%", parentId: null },
    { id: "parent", name: "Parent", icon: "🏬", color: "0 0% 0%", parentId: null },
  ];

  it("orders each parent immediately followed by its children, regardless of source order", () => {
    expect(orderCategories(cats).map((c) => c.id)).toEqual(["other", "parent", "child"]);
  });

  it("appends orphans (missing parent) at the end without dropping them", () => {
    const withOrphan: Category[] = [...cats, { id: "orphan", name: "Orphan", icon: "❓", color: "0 0% 0%", parentId: "gone" }];
    const ordered = orderCategories(withOrphan).map((c) => c.id);
    expect(ordered).toContain("orphan");
    expect(ordered).toHaveLength(4);
  });
});

describe("categoryTrends subcategories", () => {
  const cats: Category[] = [
    { id: "food", name: "Food", icon: "🍔", color: "0 0% 0%", parentId: null },
    { id: "grocery", name: "Groceries", icon: "🛒", color: "0 0% 0%", parentId: "food" },
  ];
  const m2 = buildMaps(cats);
  const t2 = (catId: string, amount: number, date: string): Transaction => ({
    id: `t${Math.random()}`, date, description: "x", amount, accountId: "a",
    categoryId: catId, predictedCategoryId: null, categoryConfidence: null, categoryLevel: null, categorySource: "user",
    needsReview: false, tagIds: [], kind: "expense",
  });

  it("emits subcategory series tagged with parentId; total/top-level have none", () => {
    const txs = [t2("grocery", -100, "2025-03-10"), t2("grocery", -50, "2025-02-10")];
    const out = categoryTrends(txs, m2, cats, "2025-03", 6);
    const grocery = out.find((s) => s.id === "grocery");
    expect(grocery?.parentId).toBe("food");
    expect(out.find((s) => s.id === "total")?.parentId == null).toBe(true);
    expect(out.find((s) => s.id === "food")?.parentId == null).toBe(true);
  });

  it("omits subcategories with no spend in the window", () => {
    const txs = [t2("food", -100, "2025-03-10")]; // spend on the parent only
    const out = categoryTrends(txs, m2, cats, "2025-03", 6);
    expect(out.find((s) => s.id === "grocery")).toBeUndefined();
  });
});

describe("budgetStatuses", () => {
  const budget: Budget = { id: "b", categoryId: "food", limit: 5000, month: null };
  const status = (spent: number) => budgetStatuses([budget], [tx(-spent)], maps, "2025-03")[0];

  it("computes spent and pct for the category", () => {
    expect(status(4500).spent).toBe(4500);
    expect(status(4500).pct).toBeCloseTo(0.9);
  });

  it("maps pct to health (under / warning / over)", () => {
    expect(status(1000).health).toBe("under");
    expect(status(4500).health).toBe("warning"); // >= 85%
    expect(status(5200).health).toBe("over"); // >= 100%
  });

  it("only includes budgets for the given month (month=null always applies)", () => {
    const oneOff: Budget = { id: "c", categoryId: "food", limit: 100, month: "2025-04" };
    expect(budgetStatuses([oneOff], [], maps, "2025-03")).toHaveLength(0);
    expect(budgetStatuses([oneOff], [], maps, "2025-04")).toHaveLength(1);
  });
});

describe("monthNet", () => {
  it("counts only expense rows; income and transfers are excluded", () => {
    const txs = [tx(-487), tx(38500, { categoryId: null }), tx(-5000, { kind: "transfer" })];
    expect(monthNet(txs, "2025-03")).toBe(-487);
  });
});

describe("earliestDataMonth / latestDataMonth", () => {
  it("returns the min and max month keys across transactions", () => {
    const txs = [
      tx(-100, { date: "2025-03-10" }),
      tx(-100, { date: "2025-01-20" }),
      tx(-100, { date: "2025-05-02" }),
    ];
    expect(earliestDataMonth(txs)).toBe("2025-01");
    expect(latestDataMonth(txs)).toBe("2025-05");
  });

  it("returns null with no transactions", () => {
    expect(earliestDataMonth([])).toBeNull();
    expect(latestDataMonth([])).toBeNull();
  });
});

describe("monthProgress", () => {
  it("marks the live month and counts elapsed days from today", () => {
    expect(monthProgress("2025-03", new Date(2025, 2, 15))).toMatchObject({
      daysInMonth: 31, daysElapsed: 15, daysLeft: 16, isCurrentMonth: true,
    });
  });

  it("treats a past month as fully elapsed", () => {
    expect(monthProgress("2025-03", new Date(2025, 5, 1))).toMatchObject({
      daysElapsed: 31, daysLeft: 0, isCurrentMonth: false, isFutureMonth: false,
    });
  });

  it("treats a future month as not started, so a forecast can't read it as complete", () => {
    expect(monthProgress("2025-09", new Date(2025, 5, 1))).toMatchObject({
      daysInMonth: 30, daysElapsed: 0, daysLeft: 30, isCurrentMonth: false, isFutureMonth: true,
    });
  });
});

describe("categorySpendInMonth", () => {
  const resto: Category = { id: "resto", name: "Restaurants", icon: "🍽️", color: "10 60% 50%", parentId: "food" };
  const m = buildMaps([food, resto]);

  it("rolls up subcategory spend and excludes non-expense rows", () => {
    const txs = [
      tx(-300, { categoryId: "food" }),
      tx(-200, { categoryId: "resto" }), // subcategory of food
      tx(-999, { categoryId: "resto", kind: "transfer" }), // excluded (not an expense)
    ];
    expect(categorySpendInMonth(txs, m, "food", "2025-03")).toBe(500);
    expect(categorySpendInMonth(txs, m, "resto", "2025-03")).toBe(200);
  });
});

describe("detectTransfersOnImport", () => {
  const mk = (id: string, accountId: string, amount: number, date: string) => ({ id, accountId, amount, date, kind: amount < 0 ? ("expense" as const) : ("income" as const) });

  it("marks a new inflow as transfer and updates the existing outflow leg", () => {
    const existing = [mk("seb-out", "seb", -5000, "2025-03-10")];
    const { rows, existingUpdates } = detectTransfersOnImport([mk("rev-in", "rev", 5000, "2025-03-11")] as never, existing as never);
    expect(rows[0].kind).toBe("transfer");
    expect(existingUpdates).toEqual([{ id: "seb-out" }]);
  });

  it("marks a new outflow as transfer and updates the existing inflow leg", () => {
    const existing = [mk("spar-in", "spar", 3000, "2025-03-10")];
    const { rows, existingUpdates } = detectTransfersOnImport([mk("seb-out", "seb", -3000, "2025-03-11")] as never, existing as never);
    expect(rows[0].kind).toBe("transfer");
    expect(existingUpdates).toEqual([{ id: "spar-in" }]);
  });

  it("leaves an unmatched inflow as income with no updates", () => {
    const { rows, existingUpdates } = detectTransfersOnImport([mk("x", "rev", 5000, "2025-03-11")] as never, [] as never);
    expect(rows[0].kind).toBe("income");
    expect(existingUpdates).toEqual([]);
  });

  it("does not pair same-account rows", () => {
    const existing = [mk("a", "seb", -5000, "2025-03-10")];
    const { rows, existingUpdates } = detectTransfersOnImport([mk("b", "seb", 5000, "2025-03-10")] as never, existing as never);
    expect(rows[0].kind).toBe("income");
    expect(existingUpdates).toEqual([]);
  });
});

describe("withDelta", () => {
  const A = { id: "a", name: "A" };
  const B = { id: "b", name: "B" };
  const C = { id: "c", name: "C" };
  it("joins current+prev by key and computes pct (null when prev is 0)", () => {
    const cur = [{ item: A, amount: 110 }, { item: B, amount: 50 }, { item: C, amount: 30 }];
    const prev = [{ item: A, amount: 100 }, { item: B, amount: 0 }];
    const out = withDelta(cur, prev, (x) => x.id);
    expect(out.map((r) => r.item.id)).toEqual(["a", "b", "c"]); // current order preserved
    expect(out[0]).toMatchObject({ amount: 110, prevAmount: 100, changePct: 10 });
    expect(out[1]).toMatchObject({ amount: 50, prevAmount: 0, changePct: null }); // prev 0 -> null
    expect(out[2]).toMatchObject({ amount: 30, prevAmount: 0, changePct: null }); // absent in prev -> 0 basis
  });
});

describe("spendBySubcategory", () => {
  const cats: Category[] = [
    { id: "food", name: "Food", icon: "🍔", color: "0 0% 0%", parentId: null },
    { id: "grocery", name: "Groceries", icon: "🛒", color: "0 0% 0%", parentId: "food" },
    { id: "resto", name: "Restaurants", icon: "🍽️", color: "0 0% 0%", parentId: "food" },
  ];
  const m = buildMaps(cats);
  const t = (id: string | null, amount: number): Transaction => ({
    id: `t${Math.random()}`, date: "2025-03-10", description: "x", amount, accountId: "a",
    categoryId: id, predictedCategoryId: null, categoryConfidence: null, categoryLevel: null, categorySource: "user",
    needsReview: false, tagIds: [], kind: "expense",
  });
  it("groups a parent's spend by immediate subcategory, sorted desc", () => {
    const txs = [t("grocery", -100), t("grocery", -50), t("resto", -200), t("food", -10)];
    const out = spendBySubcategory(txs, m, "food", "2025-03");
    expect(out.map((r) => [r.category.id, r.amount])).toEqual([["resto", 200], ["grocery", 150], ["food", 10]]);
  });
  it("excludes other months and other parents", () => {
    const txs = [t("grocery", -100), { ...t("grocery", -999), date: "2025-02-01" }];
    const out = spendBySubcategory(txs, m, "food", "2025-03");
    expect(out).toEqual([{ category: cats[1], amount: 100 }]);
  });
});

describe("spendByTag", () => {
  const tags: Tag[] = [
    { id: "fix", name: "Fixed", color: "0 0% 0%" },
    { id: "fun", name: "Fun", color: "0 0% 0%" },
  ];
  const t = (amount: number, tagIds: string[]): Transaction => ({
    id: `t${Math.random()}`, date: "2025-03-10", description: "x", amount, accountId: "a",
    categoryId: "c", predictedCategoryId: null, categoryConfidence: null, categoryLevel: null, categorySource: "user",
    needsReview: false, tagIds, kind: "expense",
  });
  it("adds a transaction's spend to every tag it carries (overlap)", () => {
    const txs = [t(-100, ["fix", "fun"]), t(-40, ["fun"]), t(-10, [])];
    const out = spendByTag(txs, tags, "2025-03");
    expect(out).toEqual([{ tag: tags[1], amount: 140 }, { tag: tags[0], amount: 100 }]); // fun 140, fix 100
  });
  it("omits tags with no spend this month", () => {
    expect(spendByTag([t(-100, ["fix"])], tags, "2025-03").map((r) => r.tag.id)).toEqual(["fix"]);
  });
});
