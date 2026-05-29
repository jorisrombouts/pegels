import { describe, expect, it } from "vitest";
import { budgetForecasts, budgetStatuses, buildMaps, categorySpendInMonth, detectTransfersOnImport, goalProgress, goalSaved, monthNet, monthProgress } from "./selectors";
import type { Account, Budget, Category, Goal, Transaction } from "./types";

const checking: Account = { id: "a", name: "Checking", type: "Checking", kind: "spending", icon: "🏦", color: "0 0% 0%", balance: 0, archived: false };
const food: Category = { id: "food", name: "Food", icon: "🍔", color: "150 60% 45%", parentId: null };
const maps = buildMaps([checking], [food]);

function tx(amount: number, o: Partial<Transaction> = {}): Transaction {
  return {
    id: `t${Math.random()}`, date: "2025-03-10", description: "x", amount, accountId: "a",
    categoryId: "food", predictedCategoryId: "food", categoryConfidence: 0.9, categorySource: "model",
    needsReview: false, tagIds: [],
    kind: amount < 0 ? "expense" : "income", goalId: null, ...o,
  };
}

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

describe("goalProgress", () => {
  const base: Goal = {
    id: "g", name: "Trip", icon: "🗾", target: 1000, baseline: 600, accountId: null, deadline: "2025-12-31",
  };

  it("sums baseline into saved and pct with no linked transfers", () => {
    const p = goalProgress(base, [], new Date("2025-06-01"));
    expect(p.saved).toBe(600);
    expect(p.pct).toBeCloseTo(0.6);
  });

  it("reports days left and overdue", () => {
    expect(goalProgress(base, [], new Date("2025-06-01")).daysLeft).toBeGreaterThan(0);
    expect(goalProgress(base, [], new Date("2026-06-01")).daysLeft).toBeLessThan(0);
  });

  it("is on track while the deadline is in the future", () => {
    expect(goalProgress(base, [], new Date("2025-06-01")).onTrack).toBe(true);
  });
});

describe("goalSaved / goalProgress (transaction-driven)", () => {
  const goal = { id: "g", name: "Japan", icon: "🗾", target: 25000, baseline: 6000, deadline: null, accountId: "spar" };
  const txs = [
    { ...tx(-3000), id: "t1", goalId: "g", kind: "transfer" as const, date: "2025-03-14" },
    { ...tx(1000), id: "t2", goalId: "g", kind: "transfer" as const, date: "2025-04-02" },
    { ...tx(-500), id: "t3", goalId: null, kind: "expense" as const, date: "2025-03-01" },
  ];
  it("sums baseline + |amount| of linked transfers", () => {
    expect(goalSaved(goal as never, txs as never)).toBe(6000 + 3000 + 1000);
  });
  it("goalProgress reports saved and pct from transactions", () => {
    const p = goalProgress(goal as never, txs as never, new Date("2025-05-01"));
    expect(p.saved).toBe(10000);
    expect(p.pct).toBeCloseTo(0.4);
  });
});

describe("monthNet", () => {
  it("counts only expense rows; income and transfers are excluded", () => {
    const txs = [tx(-487), tx(38500, { categoryId: null }), tx(-5000, { kind: "transfer" })];
    expect(monthNet(txs, "2025-03")).toBe(-487);
  });
});

describe("monthProgress", () => {
  it("marks the live month and counts elapsed days from today", () => {
    expect(monthProgress("2025-03", new Date(2025, 2, 15))).toMatchObject({
      daysInMonth: 31, daysElapsed: 15, daysLeft: 16, isCurrentMonth: true,
    });
  });

  it("treats a non-current month as fully elapsed", () => {
    expect(monthProgress("2025-03", new Date(2025, 5, 1))).toMatchObject({
      daysElapsed: 31, daysLeft: 0, isCurrentMonth: false,
    });
  });
});

describe("categorySpendInMonth", () => {
  const resto: Category = { id: "resto", name: "Restaurants", icon: "🍽️", color: "10 60% 50%", parentId: "food" };
  const m = buildMaps([checking], [food, resto]);

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
  const goals = [{ id: "g-japan", accountId: "spar" }];
  const mk = (id: string, accountId: string, amount: number, date: string) => ({ id, accountId, amount, date, kind: (amount < 0 ? "expense" : "income") as const, goalId: null });

  it("marks a new inflow as transfer and updates the existing outflow leg", () => {
    const existing = [mk("seb-out", "seb", -5000, "2025-03-10")];
    const { rows, existingUpdates } = detectTransfersOnImport([mk("rev-in", "rev", 5000, "2025-03-11")] as never, existing as never, goals as never);
    expect(rows[0].kind).toBe("transfer");
    expect(existingUpdates).toEqual([{ id: "seb-out", goalId: null }]);
  });

  it("links the outflow to a goal when the inflow account backs one", () => {
    const existing = [mk("seb-out", "seb", -3000, "2025-03-10")];
    const { rows, existingUpdates } = detectTransfersOnImport([mk("spar-in", "spar", 3000, "2025-03-10")] as never, existing as never, goals as never);
    expect(rows[0].kind).toBe("transfer");
    expect(existingUpdates).toEqual([{ id: "seb-out", goalId: "g-japan" }]);
  });

  it("when the NEW row is the outflow, it gets the goal and existing inflow has none", () => {
    const existing = [mk("spar-in", "spar", 3000, "2025-03-10")];
    const { rows, existingUpdates } = detectTransfersOnImport([mk("seb-out", "seb", -3000, "2025-03-11")] as never, existing as never, goals as never);
    expect(rows[0].kind).toBe("transfer");
    expect(rows[0].goalId).toBe("g-japan");
    expect(existingUpdates).toEqual([{ id: "spar-in", goalId: null }]);
  });

  it("leaves an unmatched inflow as income with no updates", () => {
    const { rows, existingUpdates } = detectTransfersOnImport([mk("x", "rev", 5000, "2025-03-11")] as never, [] as never, goals as never);
    expect(rows[0].kind).toBe("income");
    expect(existingUpdates).toEqual([]);
  });

  it("does not pair same-account rows", () => {
    const existing = [mk("a", "seb", -5000, "2025-03-10")];
    const { rows, existingUpdates } = detectTransfersOnImport([mk("b", "seb", 5000, "2025-03-10")] as never, existing as never, goals as never);
    expect(rows[0].kind).toBe("income");
    expect(existingUpdates).toEqual([]);
  });
});

describe("budgetForecasts", () => {
  const budget: Budget = { id: "b", categoryId: "food", limit: 5000, month: null };
  const marchMid = new Date(2025, 2, 15); // day 15 of 31

  it("projects an in-progress month over the limit when the pace is high", () => {
    const f = budgetForecasts([budget], [tx(-4000)], maps, "2025-03", marchMid)[0];
    expect(f.isProjected).toBe(true);
    expect(f.projected).toBeGreaterThan(f.spent);
    expect(f.forecastHealth).toBe("over");
    expect(f.overBy).toBeGreaterThan(0);
  });

  it("blends in category history so a low-pace month stays under", () => {
    const txs = [
      tx(-1000, { date: "2025-03-10" }),
      tx(-1500, { date: "2025-02-10" }),
      tx(-1500, { date: "2025-01-10" }),
    ];
    const f = budgetForecasts([budget], txs, maps, "2025-03", marchMid)[0];
    expect(f.isProjected).toBe(true);
    expect(f.forecastHealth).toBe("under");
    expect(f.projected).toBeLessThan(budget.limit);
  });

  it("leans on history early in the month rather than the noisy daily pace", () => {
    const txs = [
      tx(-200, { date: "2025-03-01" }),
      tx(-3000, { date: "2025-02-10" }),
      tx(-3000, { date: "2025-01-10" }),
    ];
    const f = budgetForecasts([budget], txs, maps, "2025-03", new Date(2025, 2, 1))[0];
    const linearPace = 200 * 31;
    expect(Math.abs(f.projected - 3000)).toBeLessThan(Math.abs(f.projected - linearPace));
  });

  it("falls back to linear pace with no category history", () => {
    const f = budgetForecasts([budget], [tx(-3000)], maps, "2025-03", marchMid)[0];
    expect(f.projected).toBeCloseTo((3000 / 15) * 31, 5);
  });

  it("does not project a completed (non-current) month", () => {
    const f = budgetForecasts([budget], [tx(-4000)], maps, "2025-03", new Date(2025, 5, 1))[0];
    expect(f.isProjected).toBe(false);
    expect(f.projected).toBe(f.spent);
  });
});
