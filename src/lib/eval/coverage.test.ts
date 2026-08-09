import { describe, expect, it } from "vitest";
import { blendedAccuracy, coverageFrom } from "./coverage";
import { normalizeMerchant } from "@/lib/ai/normalize";
import type { Neighbour } from "@/lib/ai/retrieve";

const neighbour = (description: string): Neighbour =>
  ({
    id: `ex-${description}`,
    dedupKey: normalizeMerchant(description),
    cleanedDescription: description,
    amount: -100,
    finalKind: "expense",
    finalCategoryId: "cat-a",
    finalTagIds: [],
    hitCount: 1,
    lastSeenAt: "2026-06-01",
    status: "approved",
    approved: true,
  }) as Neighbour;

describe("coverageFrom", () => {
  it("counts a transaction as known when retrieval returns the place itself", () => {
    const txs = [{ index: 0, description: "ICA MAXI HANINGE" }];
    const n = new Map([[0, [neighbour("ICA MAXI HANINGE")]]]);
    expect(coverageFrom(txs, n)).toMatchObject({ total: 1, covered: 1, share: 1 });
  });

  it("does not count a merely similar place — that is the case it exists to separate out", () => {
    const txs = [{ index: 0, description: "WILLYS SÖDERMALM" }];
    const n = new Map([[0, [neighbour("ICA MAXI HANINGE")]]]); // a grocer, but not this one
    expect(coverageFrom(txs, n)).toMatchObject({ covered: 0, share: 0 });
  });

  it("matches through the same normalisation retrieval stores keys under", () => {
    // Different punctuation and case — the same merchant as far as the corpus is concerned.
    const txs = [{ index: 0, description: "ica maxi  haninge" }];
    const n = new Map([[0, [neighbour("ICA MAXI HANINGE")]]]);
    expect(coverageFrom(txs, n).covered).toBe(1);
  });

  it("treats a transaction with no neighbours at all as uncovered", () => {
    expect(coverageFrom([{ index: 0, description: "NEW PLACE" }], new Map())).toMatchObject({ covered: 0 });
  });

  it("reports zero rather than dividing by zero on an empty ledger", () => {
    expect(coverageFrom([], new Map())).toMatchObject({ total: 0, covered: 0, share: 0 });
  });
});

describe("blendedAccuracy", () => {
  it("weights the two regimes by how often each actually happens", () => {
    // 80% of transactions land on a known place at 95%, the rest are new at 35%.
    expect(blendedAccuracy(0.8, 0.95, 0.35)).toBeCloseTo(0.83, 5);
  });

  it("collapses to the unseen rate when nothing is covered", () => {
    expect(blendedAccuracy(0, 0.95, 0.35)).toBeCloseTo(0.35, 5);
  });

  it("collapses to the seen rate when everything is covered", () => {
    expect(blendedAccuracy(1, 0.95, 0.35)).toBeCloseTo(0.95, 5);
  });
});
