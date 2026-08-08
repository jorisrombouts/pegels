import { describe, expect, it } from "vitest";
import { planExampleWrites, type ExampleInput } from "./record";

const NOW = "2025-07-01T12:00:00.000Z";
let seq = 0;
const opts = { userId: "u1", now: NOW, idFor: () => `ex-${++seq}` };

function input(description: string, o: Partial<ExampleInput> = {}): ExampleInput {
  return {
    rawDescription: description,
    cleanedDescription: description,
    amount: -487,
    predictedKind: "expense",
    predictedCategoryId: "cat-groceries",
    predictedTagIds: [],
    predictedConfidence: 0.9,
    finalKind: "expense",
    finalCategoryId: "cat-groceries",
    finalTagIds: [],
    ...o,
  };
}

describe("planExampleWrites — what counts as evidence", () => {
  it("treats a detail-panel edit as an affirmation the user vouched for", () => {
    const [w] = planExampleWrites([input("ICA MAXI")], "detail", opts);
    expect(w.mode).toBe("affirm");
    expect(w.status).toBe("approved");
  });

  it("treats a manual entry as an affirmation", () => {
    const [w] = planExampleWrites([input("ICA MAXI")], "manual", opts);
    expect(w.mode).toBe("affirm");
  });

  it("treats an import row the user edited as an affirmation", () => {
    const [w] = planExampleWrites(
      [input("ICA MAXI", { predictedCategoryId: "cat-other", finalCategoryId: "cat-groceries" })],
      "import",
      opts,
    );
    expect(w.mode).toBe("affirm");
    expect(w.corrected).toBe(true);
  });

  it("treats an untouched import row as a passive sighting, not evidence", () => {
    // The AI agreeing with itself proves nothing — it must not promote itself to approved.
    const [w] = planExampleWrites([input("ICA MAXI")], "import", opts);
    expect(w.mode).toBe("touch");
    expect(w.status).toBe("candidate");
    expect(w.corrected).toBe(false);
  });

  it("records a tag-only change as a correction", () => {
    // The whole point of A5: tag edits used to vanish entirely.
    const [w] = planExampleWrites(
      [input("SPOTIFY AB", { predictedTagIds: [], finalTagIds: ["tag-sub"] })],
      "import",
      opts,
    );
    expect(w.mode).toBe("affirm");
    expect(w.finalTagIds).toEqual(["tag-sub"]);
  });

  it("carries the final tags through", () => {
    const [w] = planExampleWrites([input("HYRA", { finalTagIds: ["tag-fixed"] })], "detail", opts);
    expect(w.finalTagIds).toEqual(["tag-fixed"]);
  });
});

describe("planExampleWrites — keying", () => {
  it("keys a row on its normalised merchant", () => {
    const [w] = planExampleWrites([input("ICA MAXI HANINGE 4711")], "detail", opts);
    expect(w.dedupKey).toBe("ica maxi haninge");
  });

  it("drops a row whose description carries no merchant identity", () => {
    expect(planExampleWrites([input("4711")], "detail", opts)).toEqual([]);
  });

  it("collapses rows that share a merchant within one batch", () => {
    // Two rows with the same dedupKey in one statement would make Postgres refuse the upsert
    // ("cannot affect row a second time").
    const writes = planExampleWrites(
      [input("ICA MAXI 111"), input("ICA MAXI 222"), input("COOP FORUM")],
      "import",
      opts,
    );
    expect(writes).toHaveLength(2);
    expect(writes.find((w) => w.dedupKey === "ica maxi")!.hitCount).toBe(2);
  });

  it("lets an affirmation in the batch win over a passive sighting of the same merchant", () => {
    const writes = planExampleWrites(
      [
        input("ICA MAXI 111"),
        input("ICA MAXI 222", { predictedCategoryId: "cat-other", finalCategoryId: "cat-groceries" }),
      ],
      "import",
      opts,
    );
    expect(writes).toHaveLength(1);
    expect(writes[0].mode).toBe("affirm");
    expect(writes[0].finalCategoryId).toBe("cat-groceries");
  });

  it("stamps createdAt and lastSeenAt from the injected clock", () => {
    const [w] = planExampleWrites([input("ICA MAXI")], "detail", opts);
    expect(w.createdAt).toBe(NOW);
    expect(w.lastSeenAt).toBe(NOW);
  });

  it("assigns the gold hold-out deterministically from the id", () => {
    const a = planExampleWrites([input("ICA MAXI")], "detail", { ...opts, idFor: () => "ex-fixed" })[0];
    const b = planExampleWrites([input("ICA MAXI")], "detail", { ...opts, idFor: () => "ex-fixed" })[0];
    expect(a.gold).toBe(b.gold);
  });

  it("plans nothing for an empty batch", () => {
    expect(planExampleWrites([], "import", opts)).toEqual([]);
  });
});
