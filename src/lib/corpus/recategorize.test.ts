import { describe, expect, it } from "vitest";
import { diffRecategorization, selectForRecategorize } from "./recategorize";
import type { AiResult } from "@/lib/ai/categorize-openai";
import type { Transaction } from "@/lib/domain/types";

let seq = 0;
function tx(o: Partial<Transaction> = {}): Transaction {
  return {
    id: `t-${++seq}`,
    date: "2025-06-14",
    description: "ICA MAXI",
    amount: -487,
    accountId: "acc-1",
    categoryId: "cat-groceries",
    predictedCategoryId: "cat-groceries",
    categoryConfidence: 0.8, categoryLevel: null,
    categorySource: "model",
    needsReview: false,
    tagIds: [],
    kind: "expense",
    ...o,
  };
}

describe("selectForRecategorize", () => {
  it("never touches a category the user set by hand", () => {
    // Re-running the model over a hand-corrected row would undo the user's work.
    const rows = [tx({ categorySource: "user", needsReview: true, categoryId: null })];
    expect(selectForRecategorize(rows, "needs-review")).toEqual([]);
  });

  it("picks the rows flagged for review", () => {
    const rows = [tx({ needsReview: true }), tx({ needsReview: false })];
    expect(selectForRecategorize(rows, "needs-review")).toHaveLength(1);
  });

  it("picks expenses the model left uncategorised", () => {
    const rows = [tx({ categoryId: null }), tx({ categoryId: "cat-groceries" })];
    expect(selectForRecategorize(rows, "uncategorized")).toHaveLength(1);
  });

  it("does not treat an uncategorised transfer as work to do", () => {
    // Transfers and income legitimately have no category.
    const rows = [tx({ categoryId: null, kind: "transfer" }), tx({ categoryId: null, kind: "income" })];
    expect(selectForRecategorize(rows, "uncategorized")).toEqual([]);
  });

  it("picks every model-categorised row for a full pass", () => {
    const rows = [tx(), tx({ categorySource: "user" }), tx()];
    expect(selectForRecategorize(rows, "all-model")).toHaveLength(2);
  });

  it("scopes a month pass to that month", () => {
    const rows = [tx({ date: "2025-06-14" }), tx({ date: "2025-05-02" })];
    expect(selectForRecategorize(rows, "month", "2025-06")).toHaveLength(1);
  });

  it("skips excluded rows, which are deliberately out of the picture", () => {
    expect(selectForRecategorize([tx({ excluded: true, needsReview: true })], "needs-review")).toEqual([]);
  });

  it("returns nothing for an empty history", () => {
    expect(selectForRecategorize([], "all-model")).toEqual([]);
  });
});

describe("diffRecategorization", () => {
  const result = (o: Partial<AiResult> = {}): AiResult => ({
    index: 0, kind: "expense", categoryId: "cat-groceries", tagIds: [], confidence: 0.9, level: "medium", ...o,
  });

  it("reports a genuine category change", () => {
    const rows = [tx({ categoryId: "cat-other" })];
    const { changes } = diffRecategorization(rows, [result({ categoryId: "cat-groceries" })]);
    expect(changes).toHaveLength(1);
    expect(changes[0].before.categoryId).toBe("cat-other");
    expect(changes[0].after.categoryId).toBe("cat-groceries");
  });

  it("counts a row the model agreed on as unchanged rather than rewriting it", () => {
    const rows = [tx({ categoryId: "cat-groceries", kind: "expense", tagIds: [] })];
    const { changes, unchanged } = diffRecategorization(rows, [result()]);
    expect(changes).toEqual([]);
    expect(unchanged).toBe(1);
  });

  it("notices a kind change even when the category matches", () => {
    const rows = [tx({ kind: "expense" })];
    const { changes } = diffRecategorization(rows, [result({ kind: "transfer" })]);
    expect(changes).toHaveLength(1);
  });

  it("notices a tag change", () => {
    const rows = [tx({ tagIds: [] })];
    const { changes } = diffRecategorization(rows, [result({ tagIds: ["tag-sub"] })]);
    expect(changes).toHaveLength(1);
    expect(changes[0].after.tagIds).toEqual(["tag-sub"]);
  });

  it("ignores tag order", () => {
    const rows = [tx({ tagIds: ["a", "b"] })];
    const { changes, unchanged } = diffRecategorization(rows, [result({ tagIds: ["b", "a"] })]);
    expect(changes).toEqual([]);
    expect(unchanged).toBe(1);
  });

  it("counts a row the model returned nothing for as unchanged", () => {
    const { changes, unchanged } = diffRecategorization([tx()], []);
    expect(changes).toEqual([]);
    expect(unchanged).toBe(1);
  });

  it("carries the description and amount so the preview is readable", () => {
    const rows = [tx({ description: "SPOTIFY AB", amount: -119, categoryId: "cat-other" })];
    const { changes } = diffRecategorization(rows, [result({ categoryId: "cat-groceries" })]);
    expect(changes[0]).toMatchObject({ description: "SPOTIFY AB", amount: -119 });
  });
});
