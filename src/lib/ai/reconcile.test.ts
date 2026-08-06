import { describe, expect, it } from "vitest";
import { reconcileKindWithSign } from "./reconcile";
import type { AiResult } from "./categorize-openai";

const res = (o: Partial<AiResult> = {}): AiResult => ({
  index: 0, kind: "expense", categoryId: "cat-food", tagIds: [], confidence: 0.9, ...o,
});

describe("reconcileKindWithSign", () => {
  it("leaves a result whose kind already matches the sign", () => {
    const r = res({ kind: "expense" });
    reconcileKindWithSign(r, -100);
    expect(r).toMatchObject({ kind: "expense", categoryId: "cat-food" });
  });

  it("flips income to expense when the amount is negative, keeping the category", () => {
    const r = res({ kind: "income" });
    reconcileKindWithSign(r, -100);
    expect(r).toMatchObject({ kind: "expense", categoryId: "cat-food" });
  });

  it("flips expense to income when the amount is positive, dropping the category", () => {
    // Only expenses carry a category, so a flip away from expense must clear it.
    const r = res({ kind: "expense" });
    reconcileKindWithSign(r, 38500);
    expect(r).toMatchObject({ kind: "income", categoryId: null });
  });

  it("never touches a transfer — those move in either direction", () => {
    const r = res({ kind: "transfer", categoryId: null });
    reconcileKindWithSign(r, 5000);
    expect(r.kind).toBe("transfer");
  });

  it("leaves a zero-amount row alone", () => {
    const r = res({ kind: "income" });
    reconcileKindWithSign(r, 0);
    expect(r.kind).toBe("income");
  });
});
