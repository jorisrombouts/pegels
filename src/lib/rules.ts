import type { CategorizationRule, MatchMode, TransactionKind } from "@/lib/domain/types";

export interface RuleOutcome {
  categoryId?: string;
  kind?: TransactionKind;
  addTagIds: string[];
}

export function matchesRule(description: string, rule: CategorizationRule): boolean {
  const d = description.toLowerCase();
  const m = rule.matchText.toLowerCase().trim();
  if (!m) return false;
  if (rule.matchMode === "contains") return d.includes(m);
  if (rule.matchMode === "startsWith") return d.startsWith(m);
  return d === m; // exact
}

/** First enabled rule (by priority asc) that matches; its outcome, or null. */
export function applyRules(description: string, rules: CategorizationRule[]): RuleOutcome | null {
  const ordered = rules.filter((r) => r.enabled).sort((a, b) => a.priority - b.priority);
  for (const r of ordered) {
    if (matchesRule(description, r)) {
      return {
        categoryId: r.setCategoryId ?? undefined,
        kind: r.setKind ?? undefined,
        addTagIds: r.addTagIds,
      };
    }
  }
  return null;
}

/** A "contains" match on a very short string over-matches; flag it for the user. */
export function isRiskyMatch(matchText: string, matchMode: MatchMode): boolean {
  return matchMode === "contains" && matchText.trim().length <= 2;
}
