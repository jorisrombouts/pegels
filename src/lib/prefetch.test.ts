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
  rules: [],
} as unknown as Dataset;

describe("dehydrateDataset", () => {
  it("prefetches the dataset under the ['dataset'] key into a dehydrated cache", async () => {
    const state = await dehydrateDataset(async () => sample);
    expect(state.queries).toHaveLength(1);
    expect(state.queries[0].queryKey).toEqual(["dataset"]);
    expect(state.queries[0].state.data).toEqual(sample);
  });

  // Was: "omits the query when the load fails, so a DB hiccup never blocks the render". That
  // behaviour hid a getDataset broken against the live schema behind an empty-looking app.
  it("rejects when the load fails instead of dehydrating an empty cache", async () => {
    await expect(
      dehydrateDataset(async () => {
        throw new Error('relation "categorization_rules" does not exist');
      }),
    ).rejects.toThrow('relation "categorization_rules" does not exist');
  });
});
