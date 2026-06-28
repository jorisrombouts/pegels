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

describe("computeDashboard projection", () => {
  it("projects end-of-month spend from the daily pace for the live month", () => {
    const mid = computeDashboard(seedDataset, "2025-03", "all", new Date("2025-03-15T12:00:00Z"));
    expect(mid.isCurrentMonth).toBe(true);
    expect(mid.projected).toBeGreaterThan(mid.spent); // half the month elapsed → scaled up
    expect(mid.projected).toBeCloseTo((mid.spent / mid.daysElapsed) * mid.daysInMonth, 5);
  });

  it("uses actual spend as the projection for a completed month", () => {
    const past = computeDashboard(seedDataset, "2025-03", "all", new Date("2026-06-15T12:00:00Z"));
    expect(past.isCurrentMonth).toBe(false);
    expect(past.projected).toBe(past.spent);
  });

  it("computes the projected change vs the previous month", () => {
    const mid = computeDashboard(seedDataset, "2025-03", "all", new Date("2025-03-15T12:00:00Z"));
    expect(mid.prevSpent).toBeGreaterThan(0);
    expect(mid.projectedChangePct).toBeCloseTo(((mid.projected - mid.prevSpent) / mid.prevSpent) * 100, 5);
  });
});
