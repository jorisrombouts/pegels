import { describe, expect, it } from "vitest";
import { planConsolidation, type LegacyExample } from "./consolidate";

let seq = 0;
function row(cleanedDescription: string, o: Partial<LegacyExample> = {}): LegacyExample {
  return {
    id: `ex-${++seq}`,
    userId: "u1",
    cleanedDescription,
    finalKind: "expense",
    finalCategoryId: "cat-groceries",
    corrected: false,
    source: "import",
    createdAt: "2025-03-01T00:00:00.000Z",
    ...o,
  };
}

describe("planConsolidation", () => {
  it("collapses every appearance of one merchant into a single row", () => {
    const rows = [row("ICA MAXI HANINGE"), row("ICA MAXI HANINGE 4711"), row("ICA MAXI HANINGE")];
    const plan = planConsolidation(rows);
    expect(plan.keep).toHaveLength(1);
    expect(plan.deleteIds).toHaveLength(2);
    expect(plan.keep[0].hitCount).toBe(3);
  });

  it("keeps distinct merchants apart", () => {
    const plan = planConsolidation([row("ICA MAXI"), row("COOP FORUM")]);
    expect(plan.keep).toHaveLength(2);
    expect(plan.deleteIds).toHaveLength(0);
  });

  it("scopes grouping to one user", () => {
    const plan = planConsolidation([row("ICA MAXI"), row("ICA MAXI", { userId: "u2" })]);
    expect(plan.keep).toHaveLength(2);
  });

  it("approves a merchant the user actually corrected", () => {
    const plan = planConsolidation([row("ICA MAXI"), row("ICA MAXI", { corrected: true })]);
    expect(plan.keep[0].status).toBe("approved");
  });

  it("approves a merchant confirmed from the detail panel", () => {
    const plan = planConsolidation([row("SPOTIFY AB", { source: "detail" })]);
    expect(plan.keep[0].status).toBe("approved");
  });

  it("leaves a merchant the user never touched as an unreviewed candidate", () => {
    // Passive import keeps are the AI agreeing with itself — not evidence.
    const plan = planConsolidation([row("WILLYS"), row("WILLYS")]);
    expect(plan.keep[0].status).toBe("candidate");
  });

  it("takes its labels from the most recent corrected row, not the newest row overall", () => {
    const plan = planConsolidation([
      row("ICA MAXI", { corrected: true, finalCategoryId: "cat-groceries", createdAt: "2025-02-01T00:00:00.000Z" }),
      row("ICA MAXI", { corrected: false, finalCategoryId: "cat-other", createdAt: "2025-05-01T00:00:00.000Z" }),
    ]);
    expect(plan.keep[0].finalCategoryId).toBe("cat-groceries");
  });

  it("falls back to the newest row when nothing in the group is high-signal", () => {
    const plan = planConsolidation([
      row("WILLYS", { finalCategoryId: "cat-old", createdAt: "2025-01-01T00:00:00.000Z" }),
      row("WILLYS", { finalCategoryId: "cat-new", createdAt: "2025-06-01T00:00:00.000Z" }),
    ]);
    expect(plan.keep[0].finalCategoryId).toBe("cat-new");
  });

  it("records the most recent sighting", () => {
    const plan = planConsolidation([
      row("ICA MAXI", { createdAt: "2025-01-01T00:00:00.000Z" }),
      row("ICA MAXI", { createdAt: "2025-06-01T00:00:00.000Z" }),
    ]);
    expect(plan.keep[0].lastSeenAt).toBe("2025-06-01T00:00:00.000Z");
  });

  it("drops rows whose description carries no merchant identity", () => {
    // Nothing survives normalisation, so there is no key to store them under.
    const plan = planConsolidation([row("4711"), row("ICA MAXI")]);
    expect(plan.keep.map((k) => k.dedupKey)).toEqual(["ica maxi"]);
    expect(plan.deleteIds).toHaveLength(1);
  });

  it("assigns the gold hold-out deterministically", () => {
    const rows = [row("ICA MAXI"), row("COOP"), row("WILLYS")];
    const a = planConsolidation(rows).keep.map((k) => k.gold);
    const b = planConsolidation(rows).keep.map((k) => k.gold);
    expect(a).toEqual(b);
  });

  it("plans nothing for an empty corpus", () => {
    expect(planConsolidation([])).toEqual({ keep: [], deleteIds: [] });
  });
});
