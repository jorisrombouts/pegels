import { describe, expect, it } from "vitest";
import { budgetForecasts } from "./budget-forecast";
import { buildMaps } from "@/lib/domain/selectors";
import type { Budget, Category, Transaction } from "@/lib/domain/types";

const food: Category = { id: "food", name: "Food", icon: "\u{1F354}", color: "150 60% 45%", parentId: null };
const maps = buildMaps([food]);

let seq = 0;
function tx(amount: number, o: Partial<Transaction> = {}): Transaction {
  return {
    id: `t${++seq}`, date: "2025-03-10", description: "x", amount, accountId: "a",
    categoryId: "food", predictedCategoryId: "food", categoryConfidence: 0.9, categoryLevel: null, categorySource: "model",
    needsReview: false, tagIds: [],
    kind: amount < 0 ? "expense" : "income", ...o,
  };
}

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

  it("does not extrapolate a fixed monthly charge that has already landed", () => {
    // A 3 000 kr meal-kit billed on the 1st. On day 3 the old whole-projection blend read it as
    // a 1 000 kr/day pace and pushed the budget over; it lands exactly on 3 000.
    const july = "2025-07";
    const matkasse = ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06", "2025-07"]
      .map((k) => tx(-3000, { date: `${k}-01`, description: "MATKASSE" }));
    const f = budgetForecasts([budget], matkasse, maps, july, new Date(2025, 6, 3))[0];
    expect(f.projected).toBeCloseTo(3000);
    expect(f.forecastHealth).toBe("under");
  });
});

