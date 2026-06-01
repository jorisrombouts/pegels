import { beforeEach, describe, expect, it, vi } from "vitest";

const selectWhere = vi.fn();
const onConflictDoUpdate = vi.fn(async () => {});
const values = vi.fn(() => ({ onConflictDoUpdate }));
const insert = vi.fn(() => ({ values }));

vi.mock("./index", () => ({
  db: {
    select: () => ({ from: () => ({ where: selectWhere }) }),
    insert: (...a: unknown[]) => insert(...a),
  },
}));

import { getPreferences, upsertPreferences } from "./queries";

const PREFS = { layout: [{ id: "total", size: "large" as const }], navConfig: [{ key: "home", primary: true }] };

describe("getPreferences", () => {
  beforeEach(() => selectWhere.mockReset());

  it("returns the row's layout + navConfig when a row exists", async () => {
    selectWhere.mockResolvedValue([{ userId: "u1", ...PREFS, updatedAt: "2026-06-01T00:00:00.000Z" }]);
    await expect(getPreferences("u1")).resolves.toEqual(PREFS);
  });

  it("returns null when no row exists", async () => {
    selectWhere.mockResolvedValue([]);
    await expect(getPreferences("u1")).resolves.toBeNull();
  });
});

describe("upsertPreferences", () => {
  beforeEach(() => { insert.mockClear(); values.mockClear(); onConflictDoUpdate.mockClear(); });

  it("upserts the row keyed by userId with an updatedAt stamp", async () => {
    await upsertPreferences("u1", PREFS);
    expect(insert).toHaveBeenCalledTimes(1);
    const row = values.mock.calls[0][0] as Record<string, unknown>;
    expect(row).toMatchObject({ userId: "u1", layout: PREFS.layout, navConfig: PREFS.navConfig });
    expect(typeof row.updatedAt).toBe("string");
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
  });
});
