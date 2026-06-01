import { describe, expect, it } from "vitest";
import { computeDashboard } from "./compute";
import { seedDataset } from "@/data/mock";

describe("computeDashboard delta fields", () => {
  const d = computeDashboard(seedDataset, "2025-03", "all", new Date("2025-03-31T12:00:00Z"));
  it("exposes category/tag/account rows with deltas", () => {
    expect(Array.isArray(d.byCategoryDelta)).toBe(true);
    expect(d.byCategoryDelta.length).toBeGreaterThan(0);
    const row = d.byCategoryDelta[0];
    expect(row.item).toBeTruthy();
    expect(typeof row.amount).toBe("number");
    expect(row.changePct === null || typeof row.changePct === "number").toBe(true);
    expect(Array.isArray(d.byTagDelta)).toBe(true);
    expect(Array.isArray(d.byAccountDelta)).toBe(true);
  });
  it("subcategoryDeltas returns rows for a parent that has spend", () => {
    const parent = d.byCategoryDelta[0].item.id;
    const subs = d.subcategoryDeltas(parent);
    expect(Array.isArray(subs)).toBe(true);
    expect(subs.every((s) => typeof s.amount === "number")).toBe(true);
  });
});
