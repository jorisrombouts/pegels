import { describe, expect, it } from "vitest";
import { rowToTransaction, transactionToRow, rowToAccount, accountToRow } from "./map";
import type { Account, Transaction } from "../domain/types";

describe("db mappers", () => {
  it("transaction: injects userId, maps undefined splits/notes -> null, round-trips", () => {
    const tx: Transaction = {
      id: "t1", date: "2025-03-01", description: "x", amount: -100, accountId: "a",
      categoryId: null, predictedCategoryId: null, categoryConfidence: null,
      categorySource: "user", needsReview: false, tagIds: ["tag-1"],
      kind: "expense",
    };
    const row = transactionToRow(tx, "u1");
    expect(row.userId).toBe("u1");
    expect(row.splits).toBeNull();
    expect(row.notes).toBeNull();
    expect(rowToTransaction(row)).toEqual(tx);
  });

  it("transaction: preserves splits, tagIds and notes through the round-trip", () => {
    const tx: Transaction = {
      id: "t2", date: "2025-03-02", description: "y", amount: -890, accountId: "a",
      categoryId: "c", predictedCategoryId: "c", categoryConfidence: 0.9,
      categorySource: "model", needsReview: false, tagIds: ["t", "u"],
      splits: [{ id: "s1", amount: 445, mine: true }, { id: "s2", amount: 445, mine: false, label: "P" }],
      notes: "hi", kind: "transfer",
    };
    const row = transactionToRow(tx, "u");
    expect(row.kind).toBe("transfer");
    expect(rowToTransaction(row)).toEqual(tx);
  });

  it("transaction: round-trips a decimal amount", () => {
    const tx: Transaction = {
      id: "t3", date: "2025-03-03", description: "z", amount: -188.75, accountId: "a",
      categoryId: null, predictedCategoryId: null, categoryConfidence: null,
      categorySource: "user", needsReview: false, tagIds: [],
      kind: "expense",
    };
    const back = rowToTransaction(transactionToRow(tx, "u"));
    expect(back.amount).toBe(-188.75);
    expect(back).toEqual(tx);
  });


  it("account: round-trips", () => {
    const a: Account = { id: "a", name: "n", type: "Checking", kind: "spending", icon: "🏦", color: "0 0% 0%", balance: 100, accountNumber: null, archived: false };
    expect(rowToAccount(accountToRow(a, "u"))).toEqual(a);
  });

});
