import { describe, expect, it } from "vitest";
import { matchesRule, applyRules, isRiskyMatch, suggestRulesFromMonth } from "./rules";
import type { CategorizationRule } from "@/lib/domain/types";
import type { Transaction } from "@/lib/domain/types";

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

const tx = (over: Partial<Transaction>): Transaction => ({
  id: `t${Math.random()}`, date: "2026-01-10", description: "x", amount: -100, accountId: "acc-lon",
  categoryId: "cat-groceries", predictedCategoryId: null, categoryConfidence: null, categorySource: "user",
  needsReview: false, tagIds: [], kind: "expense", goalId: null, ...over,
});

describe("suggestRulesFromMonth", () => {
  it("suggests repeated, consistent descriptions and skips one-offs", () => {
    const txs = [
      tx({ description: "ICA Supermar", categoryId: "cat-groceries" }),
      tx({ description: "ICA Supermar", categoryId: "cat-groceries" }),
      tx({ description: "Piccola Cabi", categoryId: "cat-restaurants" }), // one-off
      tx({ description: "Other month", date: "2026-02-01" }), // wrong month
    ];
    const out = suggestRulesFromMonth(txs, "2026-01", []);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ matchText: "ICA Supermar", matchMode: "contains", setCategoryId: "cat-groceries", count: 2 });
  });

  it("drops descriptions inconsistent across rows", () => {
    const txs = [
      tx({ description: "Swish 123", categoryId: "cat-groceries" }),
      tx({ description: "Swish 123", categoryId: "cat-restaurants" }),
    ];
    expect(suggestRulesFromMonth(txs, "2026-01", [])).toHaveLength(0);
  });

  it("skips descriptions already covered by an existing enabled rule", () => {
    const txs = [tx({ description: "ICA Supermar" }), tx({ description: "ICA Supermar" })];
    const existing = [{ id: "r", priority: 10, enabled: true, matchText: "ica", matchMode: "contains" as const, setCategoryId: "cat-groceries", setKind: null, addTagIds: [], origin: "manual" as const }];
    expect(suggestRulesFromMonth(txs, "2026-01", existing)).toHaveLength(0);
  });

  it("flags risky short matches and carries tags + transfer kind", () => {
    const txs = [
      tx({ description: "SL", categoryId: "cat-transit" }),
      tx({ description: "SL", categoryId: "cat-transit" }),
      tx({ description: "Revolut 022", categoryId: null, kind: "transfer" }),
      tx({ description: "Revolut 022", categoryId: null, kind: "transfer" }),
    ];
    const out = suggestRulesFromMonth(txs, "2026-01", []);
    const sl = out.find((s) => s.matchText === "SL")!;
    expect(sl.risky).toBe(true);
    const rev = out.find((s) => s.matchText === "Revolut 022")!;
    expect(rev.setKind).toBe("transfer");
  });

  it("omits setKind for sign-default expenses", () => {
    const txs = [tx({ description: "ICA Supermar" }), tx({ description: "ICA Supermar" })];
    expect(suggestRulesFromMonth(txs, "2026-01", [])[0].setKind).toBeNull();
  });
});
