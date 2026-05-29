import { describe, expect, it } from "vitest";
import { effectiveExpense, includedNet } from "./effectiveExpense";
import type { Account, Transaction } from "./types";

const checking: Account = {
  id: "acc-check",
  name: "Nordea Lönekonto",
  type: "Checking",
  kind: "spending",
  icon: "🏦",
  color: "217 91% 60%",
  archived: false,
};

const savings: Account = { ...checking, id: "acc-save", name: "Nordea Sparkonto", type: "Savings", kind: "savings" };

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
    ignored: false,
    ...overrides,
  };
}

describe("effectiveExpense", () => {
  it("counts a plain expense as its absolute amount", () => {
    expect(effectiveExpense(tx({ amount: -487 }), checking)).toBe(487);
  });

  it("does not count income (positive amount)", () => {
    expect(effectiveExpense(tx({ amount: 38500 }), checking)).toBe(0);
  });

  it("does not count ignored transactions", () => {
    expect(effectiveExpense(tx({ amount: -5000, ignored: true }), checking)).toBe(0);
  });

  it("does not count expenses on a savings account (transfer to savings)", () => {
    expect(effectiveExpense(tx({ amount: -5000, accountId: savings.id }), savings)).toBe(0);
  });

  it("counts only the `mine` portion of a split", () => {
    const t = tx({
      amount: -890,
      splits: [
        { id: "a", amount: 445, mine: true },
        { id: "b", amount: 445, mine: false },
      ],
    });
    expect(effectiveExpense(t, checking)).toBe(445);
  });

  it("treats a Revolut transfer-in like income (not spending)", () => {
    const revolut: Account = { ...checking, id: "acc-rev", name: "Revolut", type: "Revolut" };
    expect(effectiveExpense(tx({ amount: 1000, accountId: revolut.id }), revolut)).toBe(0);
  });
});

describe("includedNet", () => {
  it("excludes ignored rows from the net", () => {
    expect(includedNet(tx({ amount: -5000, ignored: true }))).toBe(0);
  });

  it("keeps income positive and expenses negative", () => {
    expect(includedNet(tx({ amount: 38500 }))).toBe(38500);
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
