import { describe, expect, it } from "vitest";
import type { Query } from "@tanstack/react-query";
import { shouldDehydrateQuery } from "./query";

const q = (queryKey: unknown[], status = "success") =>
  ({ queryKey, state: { status } }) as unknown as Query;

describe("shouldDehydrateQuery", () => {
  it("never persists the preferences query (it must be read fresh from the server)", () => {
    // A persisted, infinitely-stale copy would be restored on reload and clobber saved prefs.
    expect(shouldDehydrateQuery(q(["preferences"]))).toBe(false);
  });

  it("persists the dataset query for offline reads", () => {
    expect(shouldDehydrateQuery(q(["dataset"]))).toBe(true);
  });

  it("does not persist non-success queries", () => {
    expect(shouldDehydrateQuery(q(["dataset"], "pending"))).toBe(false);
  });
});
