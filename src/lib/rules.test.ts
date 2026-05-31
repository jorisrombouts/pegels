import { describe, expect, it } from "vitest";
import { matchesRule, applyRules, isRiskyMatch } from "./rules";
import type { CategorizationRule } from "@/lib/domain/types";

const rule = (over: Partial<CategorizationRule>): CategorizationRule => ({
  id: "r", priority: 10, enabled: true, matchText: "ica", matchMode: "contains",
  setCategoryId: "cat-groceries", setKind: null, addTagIds: [], origin: "manual", ...over,
});

describe("matchesRule", () => {
  it("contains is case-insensitive", () => {
    expect(matchesRule("ICA Supermarket", rule({ matchText: "ica", matchMode: "contains" }))).toBe(true);
    expect(matchesRule("Hemköp", rule({ matchText: "ica", matchMode: "contains" }))).toBe(false);
  });
  it("startsWith and exact", () => {
    expect(matchesRule("SL månadskort", rule({ matchText: "sl", matchMode: "startsWith" }))).toBe(true);
    expect(matchesRule("kassa SL", rule({ matchText: "sl", matchMode: "startsWith" }))).toBe(false);
    expect(matchesRule("LÖN", rule({ matchText: "lön", matchMode: "exact" }))).toBe(true);
    expect(matchesRule("LÖN ACME", rule({ matchText: "lön", matchMode: "exact" }))).toBe(false);
  });
});

describe("applyRules", () => {
  it("returns the first enabled match by priority", () => {
    const rules = [
      rule({ id: "a", priority: 20, matchText: "ica", setCategoryId: "cat-a" }),
      rule({ id: "b", priority: 10, matchText: "ica", setCategoryId: "cat-b" }),
    ];
    expect(applyRules("ICA Maxi", rules)).toEqual({ categoryId: "cat-b", kind: undefined, addTagIds: [] });
  });
  it("skips disabled rules and returns null when nothing matches", () => {
    expect(applyRules("ICA", [rule({ enabled: false })])).toBeNull();
    expect(applyRules("Hemköp", [rule({})])).toBeNull();
  });
  it("maps kind and tags", () => {
    const out = applyRules("LÅN 123", [rule({ matchText: "lån", setCategoryId: "cat-mortgage", setKind: "expense", addTagIds: ["tag-fixed"] })]);
    expect(out).toEqual({ categoryId: "cat-mortgage", kind: "expense", addTagIds: ["tag-fixed"] });
  });
});

describe("isRiskyMatch", () => {
  it("flags short contains matches", () => {
    expect(isRiskyMatch("sl", "contains")).toBe(true);
    expect(isRiskyMatch("ica supermar", "contains")).toBe(false);
    expect(isRiskyMatch("sl", "exact")).toBe(false);
  });
});
