import { beforeEach, describe, expect, it } from "vitest";
import { MAX_PRIMARY_NAV, useUI, migrateLayoutToV3, defaultLayout } from "./ui";

beforeEach(() => useUI.getState().resetNav());

const primaryKeys = () => useUI.getState().navConfig.filter((n) => n.primary).map((n) => n.key);

describe("nav config store", () => {
  it("defaults to four primary tabs", () => {
    expect(primaryKeys()).toEqual(["home", "transactions", "budgets", "goals"]);
  });

  it("won't exceed the max number of primary tabs", () => {
    expect(primaryKeys()).toHaveLength(MAX_PRIMARY_NAV);
    useUI.getState().setNavPrimary("categories", true); // 5th — should be ignored
    expect(useUI.getState().navConfig.find((n) => n.key === "categories")?.primary).toBe(false);
    expect(primaryKeys()).toHaveLength(MAX_PRIMARY_NAV);
  });

  it("frees a slot when a tab is removed, allowing another to be added", () => {
    useUI.getState().setNavPrimary("goals", false);
    expect(primaryKeys()).toHaveLength(3);
    useUI.getState().setNavPrimary("categories", true);
    expect(primaryKeys()).toContain("categories");
  });

  it("moveNavItem reorders within the list", () => {
    const before = useUI.getState().navConfig.map((n) => n.key);
    useUI.getState().moveNavItem(before[1], -1);
    const after = useUI.getState().navConfig.map((n) => n.key);
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
  });

  it("moveNavItem is a no-op at the boundaries", () => {
    const first = useUI.getState().navConfig[0].key;
    useUI.getState().moveNavItem(first, -1);
    expect(useUI.getState().navConfig[0].key).toBe(first);
  });
});

describe("migrateLayoutToV3", () => {
  it("renames category->breakdown, drops byaccount & pace, appends new defaults", () => {
    const old = [
      { id: "total", size: "large" as const },
      { id: "category", size: "medium" as const },
      { id: "byaccount", size: "medium" as const },
      { id: "pace", size: "medium" as const },
    ];
    const out = migrateLayoutToV3(old);
    const ids = out.map((w) => w.id);
    expect(ids).toContain("breakdown");
    expect(ids).not.toContain("category");
    expect(ids).not.toContain("byaccount");
    expect(ids).not.toContain("pace");
    expect(out.find((w) => w.id === "breakdown")?.size).toBe("medium");
    for (const w of defaultLayout) expect(ids).toContain(w.id);
  });
});
