import { describe, expect, it } from "vitest";
import { planCorpusBackfill } from "./backfill";
import type { Transaction } from "@/lib/domain/types";

let seq = 0;
function tx(description: string, o: Partial<Transaction> = {}): Transaction {
  return {
    id: `t-${++seq}`,
    date: "2025-05-14",
    description,
    amount: -487,
    accountId: "acc-1",
    categoryId: "cat-groceries",
    predictedCategoryId: "cat-other",
    categoryConfidence: 0.8, categoryLevel: null,
    categorySource: "user",
    needsReview: false,
    tagIds: [],
    kind: "expense",
    ...o,
  };
}

describe("planCorpusBackfill", () => {
  it("takes the transactions the user categorised by hand", () => {
    const out = planCorpusBackfill([tx("ICA MAXI HANINGE")], { includeHighConfidenceModel: false });
    expect(out).toHaveLength(1);
    expect(out[0].cleanedDescription).toBe("ICA MAXI HANINGE");
    expect(out[0].finalCategoryId).toBe("cat-groceries");
  });

  it("carries the tags the user put on them — the whole point of the backfill", () => {
    const out = planCorpusBackfill(
      [tx("HYRA APRIL", { categoryId: "cat-rent", tagIds: ["tag-fixed", "tag-home"] })],
      { includeHighConfidenceModel: false },
    );
    expect(out[0].finalTagIds).toEqual(["tag-fixed", "tag-home"]);
  });

  it("keeps what the model had predicted, so accuracy can be scored against it", () => {
    const out = planCorpusBackfill(
      [tx("ICA MAXI", { predictedCategoryId: "cat-other", categoryConfidence: 0.55 })],
      { includeHighConfidenceModel: false },
    );
    expect(out[0].predictedCategoryId).toBe("cat-other");
    expect(out[0].predictedConfidence).toBe(0.55);
  });

  it("ignores model-categorised transactions by default", () => {
    // The model agreeing with itself is not evidence.
    const out = planCorpusBackfill(
      [tx("WILLYS", { categorySource: "model" })],
      { includeHighConfidenceModel: false },
    );
    expect(out).toEqual([]);
  });

  it("can opt in to confident model rows to give a thin corpus some mass", () => {
    const out = planCorpusBackfill(
      [tx("WILLYS", { categorySource: "model", categoryConfidence: 0.95, categoryLevel: null, needsReview: false })],
      { includeHighConfidenceModel: true },
    );
    expect(out).toHaveLength(1);
  });

  it("never opts in a model row that is unsure or already flagged", () => {
    const rows = [
      tx("A", { categorySource: "model", categoryConfidence: 0.7 }),
      tx("B", { categorySource: "model", categoryConfidence: 0.95, categoryLevel: null, needsReview: true }),
    ];
    expect(planCorpusBackfill(rows, { includeHighConfidenceModel: true })).toEqual([]);
  });

  it("skips rows with no category — there is nothing to learn from them", () => {
    const out = planCorpusBackfill([tx("OKÄND", { categoryId: null })], { includeHighConfidenceModel: false });
    expect(out).toEqual([]);
  });

  it("keeps a categorised transfer or income row, which teaches kind", () => {
    const out = planCorpusBackfill(
      [tx("LÖN ACME", { kind: "income", categoryId: null, amount: 38500 })],
      { includeHighConfidenceModel: false },
    );
    expect(out).toHaveLength(1);
    expect(out[0].finalKind).toBe("income");
  });

  it("ignores excluded transactions", () => {
    const out = planCorpusBackfill([tx("GAMMALT", { excluded: true })], { includeHighConfidenceModel: false });
    expect(out).toEqual([]);
  });

  it("plans nothing for an empty history", () => {
    expect(planCorpusBackfill([], { includeHighConfidenceModel: false })).toEqual([]);
  });
});
