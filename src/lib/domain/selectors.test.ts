import { describe, expect, it } from "vitest";
import { budgetForecasts, budgetStatuses, buildMaps, categorySpendInMonth, goalProgress, monthNet, monthProgress } from "./selectors";
import type { Account, Budget, Category, Goal, Transaction } from "./types";

const checking: Account = { id: "a", name: "Checking", type: "Checking", kind: "spending", icon: "🏦", color: "0 0% 0%", balance: 0, archived: false };
const food: Category = { id: "food", name: "Food", icon: "🍔", color: "150 60% 45%", parentId: null };
const maps = buildMaps([checking], [food]);

function tx(amount: number, o: Partial<Transaction> = {}): Transaction {
  return {
    id: `t${Math.random()}`, date: "2025-03-10", description: "x", amount, accountId: "a",
    categoryId: "food", predictedCategoryId: "food", categoryConfidence: 0.9, categorySource: "model",
    needsReview: false, tagIds: [], ignored: false,
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
    contributions: [{ id: "c", date: "2025-01-01", amount: 100 }],
  };

  it("sums baseline + contributions into saved and pct", () => {
    const p = goalProgress(base, new Date("2025-06-01"));
    expect(p.saved).toBe(700);
    expect(p.pct).toBeCloseTo(0.7);
  });

  it("reports days left and overdue", () => {
    expect(goalProgress(base, new Date("2025-06-01")).daysLeft).toBeGreaterThan(0);
    expect(goalProgress(base, new Date("2026-06-01")).daysLeft).toBeLessThan(0);
  });

  it("is on track while the deadline is in the future", () => {
    expect(goalProgress(base, new Date("2025-06-01")).onTrack).toBe(true);
  });
});

describe("monthNet", () => {
  it("sums included rows, ignoring excluded ones", () => {
    const txs = [tx(-487), tx(38500, { categoryId: null }), tx(-5000, { ignored: true })];
    expect(monthNet(txs, "2025-03")).toBe(38500 - 487);
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

  it("rolls up subcategory spend and honors ignored rows", () => {
    const txs = [
      tx(-300, { categoryId: "food" }),
      tx(-200, { categoryId: "resto" }), // subcategory of food
      tx(-999, { categoryId: "resto", ignored: true }), // excluded
    ];
    expect(categorySpendInMonth(txs, m, "food", "2025-03")).toBe(500);
    expect(categorySpendInMonth(txs, m, "resto", "2025-03")).toBe(200);
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
