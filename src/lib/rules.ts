import type { CategorizationRule, MatchMode, TransactionKind, Transaction } from "@/lib/domain/types";

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

export interface SuggestedRule {
  matchText: string;
  matchMode: "contains";
  setCategoryId: string | null;
  setKind: TransactionKind | null;
  addTagIds: string[];
  count: number;
  risky: boolean;
}

/** The kind a transaction would get from its amount sign alone (no rule/LLM). */
function signKind(amount: number): TransactionKind {
  return amount < 0 ? "expense" : "income";
}

/**
 * Mine one month's transactions for rule candidates: descriptions that appear >=2x
 * and map to a single (kind, categoryId, tags) signature, not already covered by a rule.
 */
export function suggestRulesFromMonth(
  transactions: Transaction[],
  monthKey: string,
  existingRules: CategorizationRule[],
): SuggestedRule[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (!t.date.startsWith(monthKey)) continue;
    const key = t.description.toLowerCase().trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const out: SuggestedRule[] = [];
  for (const txs of groups.values()) {
    if (txs.length < 2) continue;
    const sig = (t: Transaction) => `${t.kind}|${t.categoryId ?? "-"}|${[...t.tagIds].sort().join(",")}`;
    const first = sig(txs[0]);
    if (!txs.every((t) => sig(t) === first)) continue;

    const sample = txs[0];
    const matchText = sample.description;
    if (existingRules.some((r) => r.enabled && matchesRule(sample.description, r))) continue;

    out.push({
      matchText,
      matchMode: "contains",
      setCategoryId: sample.categoryId,
      setKind: sample.kind === signKind(sample.amount) ? null : sample.kind,
      addTagIds: [...sample.tagIds],
      count: txs.length,
      risky: isRiskyMatch(matchText, "contains"),
    });
  }
  return out.sort((a, b) => b.count - a.count);
}

export interface RuleBackfillChange {
  id: string;
  description: string;
  patch: Partial<Pick<Transaction, "categoryId" | "kind" | "tagIds">>;
}

/**
 * Pick the rules a backfill should run. No `ruleId` → the full set (auto-apply semantics,
 * disabled rules skipped downstream). With a `ruleId` → just that rule, forced `enabled` so an
 * explicit "Apply this rule" runs even when its auto-toggle is off. Unknown id → empty.
 */
export function selectRulesForBackfill(rules: CategorizationRule[], ruleId?: string): CategorizationRule[] {
  if (!ruleId) return rules;
  return rules.filter((r) => r.id === ruleId).map((r) => ({ ...r, enabled: true }));
}

/** Compute the changes a rule backfill would make. Skips categorySource === "user". */
export function planRuleBackfill(transactions: Transaction[], rules: CategorizationRule[]): RuleBackfillChange[] {
  const out: RuleBackfillChange[] = [];
  for (const t of transactions) {
    if (t.categorySource === "user") continue;
    const outcome = applyRules(t.description, rules);
    if (!outcome) continue;
    const patch: RuleBackfillChange["patch"] = {};
    if (outcome.categoryId) patch.categoryId = outcome.categoryId;
    if (outcome.kind) patch.kind = outcome.kind;
    if (outcome.addTagIds.length) {
      const merged = Array.from(new Set([...t.tagIds, ...outcome.addTagIds]));
      if (merged.length !== t.tagIds.length) patch.tagIds = merged;
    }
    if (Object.keys(patch).length) out.push({ id: t.id, description: t.description, patch });
  }
  return out;
}
