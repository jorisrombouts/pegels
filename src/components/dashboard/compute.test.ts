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

describe("computeDashboard forecast", () => {
  const mid = computeDashboard(seedDataset, "2025-03", "all", new Date("2025-03-15T12:00:00Z"));

  it("splits what has landed into a fixed and a variable part that sum to spend", () => {
    expect(mid.forecast.recurringLanded + mid.forecast.variableLanded).toBeCloseTo(mid.spent);
  });

  it("projects beyond what has landed while the month is running", () => {
    expect(mid.forecast.isProjected).toBe(true);
    expect(mid.forecast.projected).toBeGreaterThan(mid.spent);
  });

  it("never extrapolates a fixed cost — the projection stays under the naive linear pace", () => {
    // The old formula was (spent/daysElapsed)*daysInMonth applied to *everything*.
    const naive = (mid.spent / mid.daysElapsed) * mid.daysInMonth;
    expect(mid.forecast.projected).toBeLessThanOrEqual(naive);
  });

  it("uses actual spend as the projection for a completed month", () => {
    const past = computeDashboard(seedDataset, "2025-03", "all", new Date("2026-06-15T12:00:00Z"));
    expect(past.isCurrentMonth).toBe(false);
    expect(past.forecast.isProjected).toBe(false);
    expect(past.forecast.projected).toBe(past.spent);
  });

  it("computes the projected change vs the previous month", () => {
    expect(mid.prevSpent).toBeGreaterThan(0);
    expect(mid.projectedChangePct).toBeCloseTo(((mid.forecast.projected - mid.prevSpent) / mid.prevSpent) * 100, 5);
  });

  it("narrows the forecast to the selected account", () => {
    const accountId = seedDataset.accounts[0].id;
    const scoped = computeDashboard(seedDataset, "2025-03", accountId, new Date("2025-03-15T12:00:00Z"));
    expect(scoped.forecast.landed).toBe(scoped.spent);
    expect(scoped.forecast.landed).toBeLessThan(mid.forecast.landed);
  });

  it("exposes a per-category outlook, biggest projection first", () => {
    expect(mid.categoryOutlook.length).toBeGreaterThan(0);
    const projections = mid.categoryOutlook.map((c) => c.projected);
    expect([...projections].sort((a, b) => b - a)).toEqual(projections);
    for (const row of mid.categoryOutlook) expect(row.category.name).toBeTruthy();
  });
});
