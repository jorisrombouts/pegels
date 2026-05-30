import { describe, expect, it } from "vitest";
import { effectiveExpense, includedNet } from "./effectiveExpense";
import type { Account, Transaction } from "./types";

const checking: Account = {
  id: "acc-check",
  name: "SEB",
  type: "Checking",
  kind: "spending",
  icon: "🏦",
  color: "217 91% 60%",
  balance: 0,
  archived: false,
};

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: "t",
    date: "2025-03-01",
    description: "Test",
    amount: -100,
    accountId: checking.id,
    categoryId: null,
    predictedCategoryId: null,
    categoryConfidence: null,
    categorySource: "model",
    needsReview: false,
    tagIds: [],
    kind: "expense",
    goalId: null,
    ...overrides,
  };
}

describe("effectiveExpense", () => {
  it("counts a plain expense as its absolute amount", () => {
    expect(effectiveExpense(tx({ amount: -487 }))).toBe(487);
  });

  it("does not count income (positive amount)", () => {
    expect(effectiveExpense(tx({ amount: 38500, kind: "income" }))).toBe(0);
  });

  it("counts only expense-kind transactions", () => {
    const base = { id: "t", date: "2025-03-01", description: "x", accountId: "a", categoryId: null, predictedCategoryId: null, categoryConfidence: null, categorySource: "user" as const, needsReview: false, tagIds: [], goalId: null };
    expect(effectiveExpense({ ...base, amount: -100, kind: "expense" })).toBe(100);
    expect(effectiveExpense({ ...base, amount: -100, kind: "transfer" })).toBe(0);
    expect(effectiveExpense({ ...base, amount: 100, kind: "income" })).toBe(0);
  });

  it("counts only the mine portion of a split expense", () => {
    const base = { id: "t", date: "2025-03-01", description: "x", accountId: "a", categoryId: null, predictedCategoryId: null, categoryConfidence: null, categorySource: "user" as const, needsReview: false, tagIds: [], goalId: null, kind: "expense" as const };
    expect(effectiveExpense({ ...base, amount: -1000, splits: [{ id: "s1", amount: 500, mine: true }, { id: "s2", amount: 500, mine: false }] })).toBe(500);
  });

  it("counts only the `mine` portion of a split", () => {
    const t = tx({
      amount: -890,
      splits: [
        { id: "a", amount: 445, mine: true },
        { id: "b", amount: 445, mine: false },
      ],
    });
    expect(effectiveExpense(t)).toBe(445);
  });
});

describe("includedNet", () => {
  it("excludes non-expense rows from the net", () => {
    expect(includedNet(tx({ amount: 38500, kind: "income" }))).toBe(0);
    expect(includedNet(tx({ amount: -5000, kind: "transfer" }))).toBe(0);
  });

  it("keeps expenses negative", () => {
    expect(includedNet(tx({ amount: -487 }))).toBe(-487);
  });

  it("reduces a split expense to the mine portion", () => {
    const t = tx({
      amount: -890,
      splits: [
        { id: "a", amount: 445, mine: true },
        { id: "b", amount: 445, mine: false },
      ],
    });
    expect(includedNet(t)).toBe(-445);
  });
});
