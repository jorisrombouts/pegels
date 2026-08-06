import { describe, expect, it } from "vitest";
import { dehydrateDataset } from "./prefetch";
import type { Dataset } from "@/data/mock";

const sample = {
  accounts: [{ id: "acc-1" }],
  categories: [],
  tags: [],
  transactions: [{ id: "t-1" }],
  budgets: [],
  goals: [],
} as unknown as Dataset;

describe("dehydrateDataset", () => {
  it("prefetches the dataset under the ['dataset'] key into a dehydrated cache", async () => {
    const state = await dehydrateDataset(async () => sample);
    expect(state.queries).toHaveLength(1);
    expect(state.queries[0].queryKey).toEqual(["dataset"]);
    expect(state.queries[0].state.data).toEqual(sample);
  });

  it("omits the query when the load fails, so a DB hiccup never blocks the render", async () => {
    const state = await dehydrateDataset(async () => {
      throw new Error("db down");
    });
    expect(state.queries).toHaveLength(0);
  });
});
