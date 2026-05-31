# Categorization Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-controlled Rules page where deterministic categorization rules (description → category/kind/tags) are created, edited, reordered, and seeded from a chosen month's corrected data; rules run on import before the LLM and can be backfilled to existing transactions.

**Architecture:** A new first-class `CategorizationRule` entity flows through the existing stack (`Dataset` → `schema.ts` → `map.ts` → `queries.ts` → `actions/data.ts` → `useData`) with optimistic reducers. A pure engine in `src/lib/rules.ts` (`applyRules`, `suggestRulesFromMonth`) drives both the import pipeline (`src/app/actions/ai.ts`) and a backfill action. The hardcoded keyword rules in `classifyRules` are retired and re-inserted as editable seed rows. UI lives at `/rules`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle ORM + Neon Postgres, TanStack Query, Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-31-categorization-rules-design.md`

---

## Conventions (read once)

- Run a single test file: `npx vitest run path/to/file.test.ts`
- Full suite: `npx vitest run`. Lint: `npm run lint`. Build: `npm run build`.
- **Exit codes:** zsh has no `PIPESTATUS`. To check pass/fail, run the command WITHOUT a pipe and read `$?` (e.g. `npx vitest run > /tmp/t.log 2>&1; echo "EXIT=$?"`), then inspect the log. Do not trust `… | tail`.
- DB migrations are explicit tsx scripts run with `npx tsx <file>` (the project does NOT use `drizzle-kit push`). `import "./env"` first so `DATABASE_URL` loads. Delete the script after a successful run.
- Commit after each task. Branch is `main`; pushing is authorized.

---

## File Structure

**Create:**
- `src/lib/rules.ts` — pure rule engine + suggestion engine.
- `src/lib/rules.test.ts` — unit tests for the engine.
- `src/app/(app)/rules/page.tsx` — Rules page (list + reorder + generate suggestions).
- `src/components/rules/rule-editor.tsx` — create/edit a single rule.
- `src/components/rules/rule-suggestions.tsx` — review + approve suggested rules.
- `src/lib/db/migrate-rules.ts` — one-off table create + seed insert (deleted after run).

**Modify:**
- `src/lib/domain/types.ts` — add `MatchMode`, `RuleOrigin`, `CategorizationRule`.
- `src/data/mock.ts` — add `rules` to `Dataset` + `seedRules` + `seedDataset.rules`.
- `src/lib/db/schema.ts` — add `categorizationRules` table.
- `src/lib/db/map.ts` — add `rowToRule` / `ruleToRow`.
- `src/lib/db/queries.ts` — rules in `getDataset`, `upsertRule`, `removeRule`, `reorderRules`, `clearAll`, `replaceAll`, plus `previewRuleBackfill` / `applyRuleBackfill`.
- `src/store/dataset-mutations.ts` — `applyUpsertRule`, `applyRemoveRule`, `applyReorderRules` + `emptyDataset.rules`.
- `src/app/actions/data.ts` — `upsertRule`, `removeRule`, `reorderRules` actions.
- `src/app/actions/ai.ts` — `applyRulesToExistingPreview` / `applyRulesToExisting`; wire `applyRules` into `categorizeTransactions`; extend `AiResult` with `addTagIds`.
- `src/store/data.ts` — expose `rules`, `upsertRule`, `removeRule`, `reorderRules`.
- `src/lib/categorize.ts` — retire `classifyRules` rule branch (keep `matchesOwnAccount`, `categorize`, `needsReview`).
- `src/components/import/import-modal.tsx` — apply rule `addTagIds` to draft rows.
- `src/components/nav/nav-items.ts` — add the `rules` destination.
- `src/store/ui.ts` — add `rules` to the default nav config.
- `src/app/(app)/settings/page.tsx` — link to the Rules page.

---

## Task 1: Domain types + Dataset field

**Files:**
- Modify: `src/lib/domain/types.ts`
- Modify: `src/data/mock.ts:10-17` (Dataset interface) and seed export
- Modify: `src/store/dataset-mutations.ts:7-14` (emptyDataset)

- [ ] **Step 1: Add the rule types to `types.ts`** (after the `TransactionKind` definition, ~line 49)

```ts
export type MatchMode = "contains" | "startsWith" | "exact";
export type RuleOrigin = "seed" | "manual" | "suggested";

export interface CategorizationRule {
  id: string;
  priority: number; // lower wins first; also defines list order
  enabled: boolean;
  matchText: string; // matched case-insensitively against the description
  matchMode: MatchMode;
  setCategoryId: string | null;
  setKind: TransactionKind | null;
  addTagIds: string[]; // union'd into the transaction's tags
  origin: RuleOrigin;
}
```

- [ ] **Step 2: Add `rules` to the `Dataset` interface in `mock.ts`**

In `src/data/mock.ts`, extend the import and the interface:

```ts
import type {
  Account, Budget, Category, CategorizationRule, Goal, Tag, Transaction,
} from "@/lib/domain/types";

export interface Dataset {
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  rules: CategorizationRule[];
}
```

- [ ] **Step 3: Add `seedRules` and wire into `seedDataset`** in `mock.ts`

Add near the other seed exports (after `tags`):

```ts
export const rules: CategorizationRule[] = [
  { id: "rule-revolut", priority: 10, enabled: true, matchText: "revolut", matchMode: "contains", setCategoryId: null, setKind: "transfer", addTagIds: [], origin: "seed" },
  { id: "rule-sebkort", priority: 20, enabled: true, matchText: "seb kort", matchMode: "contains", setCategoryId: null, setKind: "transfer", addTagIds: [], origin: "seed" },
  { id: "rule-amex-1", priority: 30, enabled: true, matchText: "american express", matchMode: "contains", setCategoryId: null, setKind: "transfer", addTagIds: [], origin: "seed" },
  { id: "rule-amex-2", priority: 40, enabled: true, matchText: "amex", matchMode: "contains", setCategoryId: null, setKind: "transfer", addTagIds: [], origin: "seed" },
  { id: "rule-avanza", priority: 50, enabled: true, matchText: "avanza", matchMode: "contains", setCategoryId: null, setKind: "transfer", addTagIds: [], origin: "seed" },
  { id: "rule-lon", priority: 60, enabled: true, matchText: "lön", matchMode: "contains", setCategoryId: null, setKind: "income", addTagIds: [], origin: "seed" },
  { id: "rule-lan", priority: 70, enabled: true, matchText: "lån", matchMode: "contains", setCategoryId: "cat-mortgage", setKind: "expense", addTagIds: ["tag-fixed"], origin: "seed" },
];
```

Find the `seedDataset` object literal at the bottom of `mock.ts` and add `rules,` to it (alongside `accounts, categories, tags, transactions, budgets, goals`).

- [ ] **Step 4: Add `rules: []` to `emptyDataset`** in `src/store/dataset-mutations.ts`

```ts
export const emptyDataset: Dataset = {
  accounts: [],
  categories: [],
  tags: [],
  transactions: [],
  budgets: [],
  goals: [],
  rules: [],
};
```

- [ ] **Step 5: Verify it compiles**

Run: `npm run build > /tmp/b.log 2>&1; echo "EXIT=$?"`
Expected: `EXIT=0`. (Type-checks the new field across `mock.ts` consumers.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/types.ts src/data/mock.ts src/store/dataset-mutations.ts
git commit -m "feat(rules): CategorizationRule type, Dataset.rules, seed rules"
```

---

## Task 2: Pure rule engine (`applyRules`)

**Files:**
- Create: `src/lib/rules.ts`
- Test: `src/lib/rules.test.ts`

- [ ] **Step 1: Write the failing test** — create `src/lib/rules.test.ts`

```ts
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
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/rules.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"`
Expected: non-zero (module `./rules` not found).

- [ ] **Step 3: Implement `src/lib/rules.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run src/lib/rules.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"`
Expected: `EXIT=0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rules.ts src/lib/rules.test.ts
git commit -m "feat(rules): pure applyRules engine + matchesRule + isRiskyMatch"
```

---

## Task 3: Suggestion engine (`suggestRulesFromMonth`)

**Files:**
- Modify: `src/lib/rules.ts`
- Test: `src/lib/rules.test.ts`

- [ ] **Step 1: Add the failing test** to `src/lib/rules.test.ts`

```ts
import { suggestRulesFromMonth } from "./rules";
import type { Transaction } from "@/lib/domain/types";

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
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/lib/rules.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"`
Expected: non-zero (`suggestRulesFromMonth` not exported).

- [ ] **Step 3: Implement `suggestRulesFromMonth`** — append to `src/lib/rules.ts`

```ts
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
    const matchText = sample.description; // original casing for display; matched lowercased
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
```

- [ ] **Step 4: Run to confirm pass**

Run: `npx vitest run src/lib/rules.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"`
Expected: `EXIT=0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rules.ts src/lib/rules.test.ts
git commit -m "feat(rules): suggestRulesFromMonth (repeated+consistent, skip-covered, risky flag)"
```

---

## Task 4: DB schema + row mappers

**Files:**
- Modify: `src/lib/db/schema.ts` (after the `budgets` table, ~line 81)
- Modify: `src/lib/db/map.ts`
- Test: `src/lib/db/map.test.ts`

- [ ] **Step 1: Add the table to `schema.ts`**

```ts
export const categorizationRules = pgTable(
  "categorization_rules",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    priority: real("priority").notNull(),
    enabled: boolean("enabled").notNull(),
    matchText: text("match_text").notNull(),
    matchMode: text("match_mode").$type<MatchMode>().notNull(),
    setCategoryId: text("set_category_id"),
    setKind: text("set_kind").$type<TransactionKind>(),
    addTagIds: jsonb("add_tag_ids").$type<string[]>().notNull(),
    origin: text("origin").$type<RuleOrigin>().notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("rules_user_idx").on(t.userId)],
);
```

Update the import on line 2 to include the new types:

```ts
import type { AccountKind, CategorySource, MatchMode, RuleOrigin, Split, TransactionKind } from "../domain/types";
```

- [ ] **Step 2: Add mappers to `map.ts`**

Add to the type aliases block (top):

```ts
import type { accounts, categories, tags, transactions, budgets, goals, categorizationRules } from "./schema";
type RuleRow = typeof categorizationRules.$inferSelect;
```

Add the import of `CategorizationRule` to the domain-types import line, then add mappers:

```ts
export function rowToRule(r: RuleRow): CategorizationRule {
  return {
    id: r.id, priority: Number(r.priority), enabled: r.enabled,
    matchText: r.matchText, matchMode: r.matchMode,
    setCategoryId: r.setCategoryId, setKind: r.setKind,
    addTagIds: r.addTagIds ?? [], origin: r.origin,
  };
}

export function ruleToRow(rule: CategorizationRule, userId: string): RuleRow {
  return {
    id: rule.id, userId, priority: rule.priority, enabled: rule.enabled,
    matchText: rule.matchText, matchMode: rule.matchMode,
    setCategoryId: rule.setCategoryId, setKind: rule.setKind,
    addTagIds: rule.addTagIds, origin: rule.origin,
    createdAt: new Date().toISOString(),
  };
}
```

(Reuse `new Date().toISOString()` only here — this file is never imported by vitest, which forbids `Date.now`; if a test imports it, pass `createdAt` in instead. The map tests below do not assert on `createdAt`.)

- [ ] **Step 3: Add a round-trip test** to `src/lib/db/map.test.ts`

Import `CategorizationRule` and `rowToRule, ruleToRow`, then:

```ts
it("rule: round-trips", () => {
  const r: CategorizationRule = {
    id: "r1", priority: 10, enabled: true, matchText: "ica", matchMode: "contains",
    setCategoryId: "cat-groceries", setKind: null, addTagIds: ["tag-fixed"], origin: "seed",
  };
  const back = rowToRule(ruleToRow(r, "u"));
  expect(back).toEqual(r);
});
```

- [ ] **Step 4: Run the map tests**

Run: `npx vitest run src/lib/db/map.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"`
Expected: `EXIT=0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/map.ts src/lib/db/map.test.ts
git commit -m "feat(rules): categorization_rules table + row mappers"
```

---

## Task 5: Queries, server actions, store wiring

**Files:**
- Modify: `src/lib/db/queries.ts`
- Modify: `src/app/actions/data.ts`
- Modify: `src/store/dataset-mutations.ts`
- Modify: `src/store/data.ts`
- Test: `src/store/dataset-mutations.test.ts` (create if absent)

- [ ] **Step 1: Extend `queries.ts`**

Add `categorizationRules` to the schema import and `rowToRule, ruleToRow` to the map import. Then:

In `getDataset`, add to the `Promise.all` array and the return object:
```ts
db.select().from(categorizationRules).where(eq(categorizationRules.userId, userId)),
```
Destructure it as `ruleRows` and add `rules: ruleRows.map(rowToRule),` to the returned object.

Add upsert/remove/reorder:
```ts
export async function upsertRule(userId: string, r: CategorizationRule): Promise<void> {
  const row = ruleToRow(r, userId);
  await db.insert(categorizationRules).values(row).onConflictDoUpdate({ target: categorizationRules.id, set: row });
}

export async function removeRule(userId: string, id: string): Promise<void> {
  await db.delete(categorizationRules).where(and(eq(categorizationRules.userId, userId), eq(categorizationRules.id, id)));
}

export async function reorderRules(userId: string, orderedIds: string[]): Promise<void> {
  if (!orderedIds.length) return;
  await batch(
    orderedIds.map((id, i) =>
      db.update(categorizationRules).set({ priority: (i + 1) * 10 }).where(and(eq(categorizationRules.userId, userId), eq(categorizationRules.id, id))),
    ),
  );
}
```

Add the `CategorizationRule` import to the domain-types import line.

In `clearAll` and `replaceAll`, add a delete op:
```ts
db.delete(categorizationRules).where(eq(categorizationRules.userId, userId)),
```
In `replaceAll`, also add an insert op:
```ts
if (data.rules.length) ops.push(db.insert(categorizationRules).values(data.rules.map((r) => ruleToRow(r, userId))));
```

- [ ] **Step 2: Add server actions in `actions/data.ts`**

```ts
import type { /* …existing… */ CategorizationRule } from "@/lib/domain/types";

export async function upsertRule(r: CategorizationRule): Promise<void> {
  return q.upsertRule(await getUserId(), r);
}
export async function removeRule(id: string): Promise<void> {
  return q.removeRule(await getUserId(), id);
}
export async function reorderRules(orderedIds: string[]): Promise<void> {
  return q.reorderRules(await getUserId(), orderedIds);
}
```

- [ ] **Step 3: Add optimistic reducers in `dataset-mutations.ts`**

```ts
export function applyUpsertRule(d: Dataset, r: CategorizationRule): Dataset {
  return { ...d, rules: upsertById(d.rules, r) };
}
export function applyRemoveRule(d: Dataset, id: string): Dataset {
  return { ...d, rules: d.rules.filter((r) => r.id !== id) };
}
export function applyReorderRules(d: Dataset, orderedIds: string[]): Dataset {
  const byId = new Map(d.rules.map((r) => [r.id, r]));
  const rules = orderedIds
    .map((id, i) => { const r = byId.get(id); return r ? { ...r, priority: (i + 1) * 10 } : null; })
    .filter((r): r is CategorizationRule => r !== null);
  return { ...d, rules };
}
```

Add `CategorizationRule` to the domain-types import in `dataset-mutations.ts`.

- [ ] **Step 4: Expose in `useData` (`store/data.ts`)**

Add `CategorizationRule` to the domain-types import, then add to the returned actions:
```ts
upsertRule: (r: CategorizationRule) => run((d) => M.applyUpsertRule(d, r), () => api.upsertRule(r)),
removeRule: (id: string) => run((d) => M.applyRemoveRule(d, id), () => api.removeRule(id)),
reorderRules: (orderedIds: string[]) => run((d) => M.applyReorderRules(d, orderedIds), () => api.reorderRules(orderedIds)),
```

- [ ] **Step 5: Test the reducers** — add to `src/store/dataset-mutations.test.ts` (create with the standard header if it does not exist)

```ts
import { describe, expect, it } from "vitest";
import { emptyDataset, applyUpsertRule, applyRemoveRule, applyReorderRules } from "./dataset-mutations";
import type { CategorizationRule } from "@/lib/domain/types";

const r = (id: string, priority: number): CategorizationRule => ({
  id, priority, enabled: true, matchText: id, matchMode: "contains",
  setCategoryId: "cat-x", setKind: null, addTagIds: [], origin: "manual",
});

describe("rule reducers", () => {
  it("upserts, removes, and reorders with new priorities", () => {
    let d = applyUpsertRule(emptyDataset, r("a", 10));
    d = applyUpsertRule(d, r("b", 20));
    expect(d.rules.map((x) => x.id)).toEqual(["a", "b"]);
    d = applyReorderRules(d, ["b", "a"]);
    expect(d.rules.map((x) => x.id)).toEqual(["b", "a"]);
    expect(d.rules.map((x) => x.priority)).toEqual([10, 20]);
    d = applyRemoveRule(d, "b");
    expect(d.rules.map((x) => x.id)).toEqual(["a"]);
  });
});
```

- [ ] **Step 6: Run reducer tests + build**

Run: `npx vitest run src/store/dataset-mutations.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"` → `EXIT=0`
Run: `npm run build > /tmp/b.log 2>&1; echo "EXIT=$?"` → `EXIT=0`

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/queries.ts src/app/actions/data.ts src/store/dataset-mutations.ts src/store/dataset-mutations.test.ts src/store/data.ts
git commit -m "feat(rules): queries, actions, optimistic store wiring for rules"
```

---

## Task 6: Migration + retire `classifyRules` branch

**Files:**
- Create (temporary): `src/lib/db/migrate-rules.ts`
- Modify: `src/lib/categorize.ts`
- Modify: `src/lib/categorize.test.ts`

- [ ] **Step 1: Write the migration script** `src/lib/db/migrate-rules.ts`

```ts
// One-off: create categorization_rules and seed the built-in rules. Run once, then delete.
import "./env";
import { db } from "./index";
import { sql } from "drizzle-orm";
import { upsertRule } from "./queries";
import { STUB_USER_ID } from "../auth";
import { rules as seedRules } from "../../data/mock";

async function main() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS categorization_rules (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      priority real NOT NULL,
      enabled boolean NOT NULL,
      match_text text NOT NULL,
      match_mode text NOT NULL,
      set_category_id text,
      set_kind text,
      add_tag_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      origin text NOT NULL,
      created_at text NOT NULL
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS rules_user_idx ON categorization_rules (user_id)`);
  for (const r of seedRules) await upsertRule(STUB_USER_ID, r);
  console.log(`categorization_rules ready; seeded ${seedRules.length} rules.`);
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it, then delete it**

Run: `npx tsx src/lib/db/migrate-rules.ts > /tmp/m.log 2>&1; echo "EXIT=$?"; cat /tmp/m.log`
Expected: `EXIT=0` and "seeded 7 rules."
Then: `rm src/lib/db/migrate-rules.ts`

- [ ] **Step 3: Update the categorize test** — in `src/lib/categorize.test.ts`, delete the `describe("classifyRules", …)` block entirely and remove `classifyRules` from the import on line 2. (The `matchesOwnAccount`, `categorize`, `needsReview` tests stay.)

- [ ] **Step 4: Retire the rule branch** — in `src/lib/categorize.ts`, delete the `RuleClassification` interface (lines 13-16) and the `classifyRules` function (lines 18-28). Keep `matchesOwnAccount`, `RULES`, `categorize`, `needsReview`, and the `CategoryGuess` interface.

- [ ] **Step 5: Run categorize tests + lint** (ai.ts still imports `classifyRules` — that is fixed in Task 7; run lint to confirm only that reference is now dangling)

Run: `npx vitest run src/lib/categorize.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"` → `EXIT=0`

- [ ] **Step 6: Commit** (do not commit the deleted migration script — it is already removed)

```bash
git add src/lib/categorize.ts src/lib/categorize.test.ts
git commit -m "refactor(rules): retire hardcoded classifyRules branch (migrated to seed rows)"
```

---

## Task 7: Wire rules into the import pipeline

**Files:**
- Modify: `src/lib/ai/categorize-openai.ts` (`AiResult` shape)
- Modify: `src/app/actions/ai.ts` (`categorizeTransactions`)
- Test: `src/app/actions/ai.test.ts`

- [ ] **Step 1: Extend `AiResult`** in `src/lib/ai/categorize-openai.ts`

Add an optional field to the `AiResult` interface:
```ts
export interface AiResult {
  index: number;
  kind: TransactionKind;
  categoryId: string | null;
  confidence: number;
  addTagIds?: string[];
}
```
(The OpenAI JSON schema and `categorizeWithOpenAI` are unchanged — `addTagIds` is only ever populated by the rule layer in `ai.ts`, not the model.)

- [ ] **Step 2: Update the failing test** in `src/app/actions/ai.test.ts`

The mocked `getDataset` already returns `accounts` + `categories`. Add `rules` to it (inside `getDatasetMock.mockResolvedValue({ … })`):
```ts
rules: [
  { id: "r-ica", priority: 10, enabled: true, matchText: "ica", matchMode: "contains", setCategoryId: "cat-groceries", setKind: null, addTagIds: ["tag-fixed"], origin: "manual" },
],
```
Then add a test:
```ts
it("applies a matching rule deterministically and skips the LLM, carrying tags", async () => {
  categorizeWithOpenAIMock.mockResolvedValue([]);
  const out = await categorizeTransactions([{ index: 0, description: "ICA Maxi", amount: -200 }]);
  expect(categorizeWithOpenAIMock).not.toHaveBeenCalled();
  expect(out[0]).toMatchObject({ index: 0, kind: "expense", categoryId: "cat-groceries", confidence: 1, addTagIds: ["tag-fixed"] });
});
```
(The existing tests that pass merchant strings the rule does not match — e.g. `AVANZA`, `ICA KVANTUM` for the LLM-merge test — still exercise the LLM path. If any existing test description now collides with the `r-ica` rule, change that test's description to one the rule does not match, e.g. `"KVANTUM"`.)

- [ ] **Step 3: Run to confirm failure**

Run: `npx vitest run src/app/actions/ai.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"` → non-zero.

- [ ] **Step 4: Rewrite the rule/own-account block of `categorizeTransactions`**

Replace the import of `classifyRules` with `applyRules`:
```ts
import { categorize, matchesOwnAccount } from "@/lib/categorize";
import { applyRules } from "@/lib/rules";
```
Replace step 1 ("deterministic rules first") with the rule ladder. Full replacement of the loop:
```ts
// 1) deterministic: own-account transfers, then user rules
const ownNumbers = data.accounts.map((a) => a.accountNumber).filter((n): n is string => !!n);
const ruled = new Map<number, AiResult>();
const ruleTags = new Map<number, string[]>(); // tags from a non-resolving rule, merged after the LLM
const remaining: AiRow[] = [];
for (const r of rows) {
  if (matchesOwnAccount(r.description, ownNumbers)) {
    ruled.set(r.index, { index: r.index, kind: "transfer", categoryId: null, confidence: 1, addTagIds: [] });
    continue;
  }
  const outcome = applyRules(r.description, data.rules);
  const resolves = outcome && (outcome.categoryId != null || outcome.kind === "income" || outcome.kind === "transfer");
  if (outcome && resolves) {
    ruled.set(r.index, {
      index: r.index,
      kind: outcome.kind ?? (r.amount < 0 ? "expense" : "income"),
      categoryId: outcome.categoryId ?? null,
      confidence: 1,
      addTagIds: outcome.addTagIds,
    });
  } else {
    if (outcome) ruleTags.set(r.index, outcome.addTagIds); // tag-only rule: still LLM-categorize, but keep tags
    remaining.push(r);
  }
}
```
Then in the merge step (step 3), attach `addTagIds` for the LLM-resolved rows:
```ts
const res =
  ruled.get(r.index) ??
  aiResults.find((a) => a.index === r.index) ??
  ({ index: r.index, kind: r.amount < 0 ? "expense" : "income", categoryId: null, confidence: 0.4 } as AiResult);
if (res.categoryId && !validIds.has(res.categoryId)) res.categoryId = null;
if (!ruled.has(r.index)) res.addTagIds = ruleTags.get(r.index) ?? [];
out.push(res);
```
Add `data.rules` access — `getDataset` already returns it (Task 5).

- [ ] **Step 5: Run the ai tests**

Run: `npx vitest run src/app/actions/ai.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"` → `EXIT=0`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/categorize-openai.ts src/app/actions/ai.ts src/app/actions/ai.test.ts
git commit -m "feat(rules): run applyRules before the LLM at import; carry rule tags"
```

---

## Task 8: Apply rule tags in the import review

**Files:**
- Modify: `src/components/import/import-modal.tsx`

- [ ] **Step 1: Carry `addTagIds` into draft rows** — in `buildRows`, the AI result `res` now may have `addTagIds`. Find where `tagIds: []` is set on the draft (in the `base.map(...)` that builds drafts) and replace with:

```ts
tagIds: res?.addTagIds ?? [],
```

- [ ] **Step 2: Verify build + a manual smoke note**

Run: `npm run build > /tmp/b.log 2>&1; echo "EXIT=$?"` → `EXIT=0`.
(Manual check happens in Task 13's verification: importing a row matching `lån` lands with the Fixed cost tag.)

- [ ] **Step 3: Commit**

```bash
git add src/components/import/import-modal.tsx
git commit -m "feat(rules): apply rule-added tags to imported rows"
```

---

## Task 9: Backfill action (preview + apply)

**Files:**
- Modify: `src/app/actions/ai.ts`
- Test: `src/lib/rules.test.ts` (pure helper) + `src/app/actions/ai.test.ts` (action)

- [ ] **Step 1: Add a pure backfill planner to `src/lib/rules.ts`** with a test first

Test (append to `rules.test.ts`):
```ts
import { planRuleBackfill } from "./rules";

describe("planRuleBackfill", () => {
  const rules = [{ id: "r", priority: 10, enabled: true, matchText: "ica", matchMode: "contains" as const, setCategoryId: "cat-groceries", setKind: null, addTagIds: ["tag-fixed"], origin: "manual" as const }];
  it("plans changes and skips manually-corrected rows", () => {
    const txs = [
      tx({ id: "a", description: "ICA Maxi", categoryId: null, categorySource: "model", tagIds: [] }),
      tx({ id: "b", description: "ICA Maxi", categoryId: "cat-x", categorySource: "user", tagIds: [] }), // protected
      tx({ id: "c", description: "Hemköp", categorySource: "model" }), // no match
    ];
    const plan = planRuleBackfill(txs, rules);
    expect(plan.map((p) => p.id)).toEqual(["a"]);
    expect(plan[0].patch).toMatchObject({ categoryId: "cat-groceries", tagIds: ["tag-fixed"] });
  });
});
```
Implementation (append to `rules.ts`):
```ts
export interface RuleBackfillChange {
  id: string;
  description: string;
  patch: Partial<Pick<Transaction, "categoryId" | "kind" | "tagIds">>;
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
```
Add `Transaction` to the imports at the top of `rules.ts` (it is already imported).

Run: `npx vitest run src/lib/rules.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"` → `EXIT=0`.

- [ ] **Step 2: Add the server actions to `actions/ai.ts`**

```ts
import { applyRules, planRuleBackfill } from "@/lib/rules";

export async function previewRuleBackfill(): Promise<{ count: number; samples: { description: string }[] }> {
  const userId = await getUserId();
  const data = await getDataset(userId);
  const plan = planRuleBackfill(data.transactions, data.rules);
  return { count: plan.length, samples: plan.slice(0, 8).map((p) => ({ description: p.description })) };
}

export async function applyRuleBackfill(): Promise<number> {
  const userId = await getUserId();
  const data = await getDataset(userId);
  const plan = planRuleBackfill(data.transactions, data.rules);
  const byId = new Map(data.transactions.map((t) => [t.id, t]));
  for (const change of plan) {
    const tx = byId.get(change.id)!;
    await upsertTransaction(userId, { ...tx, ...change.patch });
  }
  return plan.length;
}
```
Add `import { upsertTransaction } from "@/lib/db/queries";` (or call `q.upsertTransaction` if `ai.ts` imports queries as a namespace — match the existing import style in the file).

- [ ] **Step 3: Build to typecheck**

Run: `npm run build > /tmp/b.log 2>&1; echo "EXIT=$?"` → `EXIT=0`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/rules.ts src/lib/rules.test.ts src/app/actions/ai.ts
git commit -m "feat(rules): planRuleBackfill + preview/apply backfill actions (protect manual edits)"
```

---

## Task 10: Rule editor component

**Files:**
- Create: `src/components/rules/rule-editor.tsx`

- [ ] **Step 1: Implement the editor** (mirrors `category-editor.tsx`; uses `Select` from `@/components/ui/select` and `orderCategories`)

```tsx
"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useData } from "@/store/data";
import { orderCategories } from "@/lib/domain/selectors";
import type { CategorizationRule, MatchMode, TransactionKind } from "@/lib/domain/types";

const MODES: { value: MatchMode; label: string }[] = [
  { value: "contains", label: "contains" },
  { value: "startsWith", label: "starts with" },
  { value: "exact", label: "is exactly" },
];

export function RuleEditor({ rule, onClose }: { rule: CategorizationRule | null; onClose: () => void }) {
  const { categories, tags, rules, upsertRule, removeRule } = useData();

  const [matchText, setMatchText] = useState(rule?.matchText ?? "");
  const [matchMode, setMatchMode] = useState<MatchMode>(rule?.matchMode ?? "contains");
  const [categoryId, setCategoryId] = useState<string>(rule?.setCategoryId ?? "");
  const [kind, setKind] = useState<string>(rule?.setKind ?? "");
  const [addTagIds, setAddTagIds] = useState<string[]>(rule?.addTagIds ?? []);

  const hasOutcome = !!categoryId || !!kind || addTagIds.length > 0;
  const canSave = matchText.trim().length > 0 && hasOutcome;

  function save() {
    if (!canSave) return;
    const maxPriority = rules.reduce((m, r) => Math.max(m, r.priority), 0);
    upsertRule({
      id: rule?.id ?? `rule-${Date.now()}`,
      priority: rule?.priority ?? maxPriority + 10,
      enabled: rule?.enabled ?? true,
      matchText: matchText.trim(),
      matchMode,
      setCategoryId: categoryId || null,
      setKind: (kind || null) as TransactionKind | null,
      addTagIds,
      origin: rule?.origin ?? "manual",
    });
    onClose();
  }

  return (
    <div className="space-y-5">
      <p className="text-lg font-semibold">{rule ? "Edit rule" : "New rule"}</p>

      <Field label="When description">
        <div className="flex gap-2">
          <Select value={matchMode} onValueChange={(v) => setMatchMode(v as MatchMode)}>
            <SelectTrigger className="w-36 shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>{MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
          <Input value={matchText} onChange={(e) => setMatchText(e.target.value)} placeholder="e.g. ica supermar" className="flex-1" />
        </div>
      </Field>

      <Field label="Set category">
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger><SelectValue placeholder="(leave as-is)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">(leave as-is)</SelectItem>
            {orderCategories(categories).map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.parentId ? "↳ " : ""}{c.icon} {c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Set kind">
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger><SelectValue placeholder="(leave as-is)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">(leave as-is)</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field label="Add tags">
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => {
            const on = addTagIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setAddTagIds((cur) => (on ? cur.filter((x) => x !== t.id) : [...cur, t.id]))}
                className={on ? "rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground" : "rounded-full glass-inset px-2.5 py-1 text-xs text-muted-foreground"}
              >
                {t.name}
              </button>
            );
          })}
        </div>
      </Field>

      <div className="flex items-center justify-between pt-1">
        {rule ? (
          <Button variant="danger" size="sm" onClick={() => { removeRule(rule.id); onClose(); }} className="gap-1.5">
            <Trash2 className="size-4" /> Delete
          </Button>
        ) : <span />}
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={!canSave}>Save</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build to typecheck**

Run: `npm run build > /tmp/b.log 2>&1; echo "EXIT=$?"` → `EXIT=0`. (`@/components/ui/select` exports `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` — confirmed in `transaction-detail.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/rules/rule-editor.tsx
git commit -m "feat(rules): rule editor component"
```

---

## Task 11: Suggestions review component

**Files:**
- Create: `src/components/rules/rule-suggestions.tsx`

- [ ] **Step 1: Implement the suggestions panel**

```tsx
"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useData } from "@/store/data";
import { buildMaps } from "@/lib/domain/selectors";
import { suggestRulesFromMonth } from "@/lib/rules";
import type { CategorizationRule } from "@/lib/domain/types";

/** Months present in the data, newest first, as "yyyy-mm". */
function dataMonths(dates: string[]): string[] {
  return Array.from(new Set(dates.map((d) => d.slice(0, 7)))).sort().reverse();
}

export function RuleSuggestions({ onApproved }: { onApproved: () => void }) {
  const { transactions, categories, rules, upsertRule } = useData();
  const categoryById = buildMaps(categories).categoryById;
  const months = useMemo(() => dataMonths(transactions.map((t) => t.date)), [transactions]);
  const [month, setMonth] = useState(months[0] ?? "");
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const suggestions = useMemo(
    () => (month ? suggestRulesFromMonth(transactions, month, rules) : []),
    [transactions, month, rules],
  );

  function toggle(i: number) {
    setChecked((cur) => { const n = new Set(cur); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }

  function approve() {
    const base = rules.reduce((m, r) => Math.max(m, r.priority), 0);
    let p = base;
    suggestions.forEach((s, i) => {
      if (!checked.has(i)) return;
      p += 10;
      const r: CategorizationRule = {
        id: `rule-${Date.now()}-${i}`, priority: p, enabled: true,
        matchText: s.matchText, matchMode: s.matchMode,
        setCategoryId: s.setCategoryId, setKind: s.setKind, addTagIds: s.addTagIds, origin: "suggested",
      };
      upsertRule(r);
    });
    setChecked(new Set());
    onApproved();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Suggest from</span>
        <Select value={month} onValueChange={(v) => { setMonth(v); setChecked(new Set()); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Pick a month" /></SelectTrigger>
          <SelectContent>{months.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {suggestions.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No new rule suggestions for this month.</p>
      ) : (
        <div className="space-y-1">
          {suggestions.map((s, i) => {
            const cat = s.setCategoryId ? categoryById.get(s.setCategoryId) : undefined;
            return (
              <label key={i} className="flex items-center gap-2 rounded-xl glass-inset px-3 py-2 text-sm">
                <input type="checkbox" checked={checked.has(i)} onChange={() => toggle(i)} className="size-4 accent-[hsl(var(--primary))]" />
                <span className="flex-1 truncate">
                  <span className="text-muted-foreground">contains</span> “{s.matchText}” → {cat ? `${cat.icon} ${cat.name}` : s.setKind ?? "(tags)"}
                  {s.addTagIds.length > 0 && <span className="text-muted-foreground"> +{s.addTagIds.length} tag</span>}
                </span>
                {s.risky && <AlertTriangle className="size-4 shrink-0 text-[hsl(var(--warning))]" aria-label="Short match — review before approving" />}
                <span className="tnum shrink-0 text-xs text-muted-foreground">×{s.count}</span>
              </label>
            );
          })}
          <div className="flex justify-end pt-2">
            <Button size="sm" onClick={approve} disabled={checked.size === 0}>Approve {checked.size || ""} selected</Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

(Pre-checking non-risky suggestions is intentionally NOT auto-done here to keep the checkbox state simple; the user ticks what they want. If pre-check is desired later it is a one-line `useState` initializer.)

- [ ] **Step 2: Build to typecheck**

Run: `npm run build > /tmp/b.log 2>&1; echo "EXIT=$?"` → `EXIT=0`.

- [ ] **Step 3: Commit**

```bash
git add src/components/rules/rule-suggestions.tsx
git commit -m "feat(rules): suggestions review panel (per-month, approve selected)"
```

---

## Task 12: Rules page (list, reorder, toggle, suggestions, backfill)

**Files:**
- Create: `src/app/(app)/rules/page.tsx`

- [ ] **Step 1: Implement the page** (list mirrors the Settings nav reorder pattern: up/down arrows, not drag)

```tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus, Wand2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { RuleEditor } from "@/components/rules/rule-editor";
import { RuleSuggestions } from "@/components/rules/rule-suggestions";
import { useData } from "@/store/data";
import { buildMaps } from "@/lib/domain/selectors";
import { previewRuleBackfill, applyRuleBackfill } from "@/app/actions/ai";
import type { CategorizationRule } from "@/lib/domain/types";

export default function RulesPage() {
  const { rules, categories, tags, upsertRule, reorderRules } = useData();
  const categoryById = buildMaps(categories).categoryById;
  const tagById = new Map(tags.map((t) => [t.id, t]));
  const ordered = [...rules].sort((a, b) => a.priority - b.priority);

  const [editing, setEditing] = useState<CategorizationRule | null | "new">(null);
  const [showSuggest, setShowSuggest] = useState(false);
  const [backfill, setBackfill] = useState<{ count: number; samples: { description: string }[] } | null>(null);

  function move(i: number, dir: -1 | 1) {
    const next = [...ordered];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    reorderRules(next.map((r) => r.id));
  }

  async function openBackfill() {
    setBackfill(await previewRuleBackfill());
  }

  return (
    <>
      <PageHeader title="Rules" subtitle="Auto-categorize transactions before the AI runs." />

      <div className="mb-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setEditing("new")} className="gap-1.5"><Plus className="size-4" /> New rule</Button>
        <Button size="sm" variant="glass" onClick={() => setShowSuggest(true)} className="gap-1.5"><Wand2 className="size-4" /> Generate suggestions</Button>
        <Button size="sm" variant="glass" onClick={openBackfill}>Apply rules to existing…</Button>
      </div>

      <Card className="space-y-1">
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground">
          🔒 own account numbers → Transfer <span className="text-xs">(system · auto)</span>
        </div>
        {ordered.map((r, i) => {
          const cat = r.setCategoryId ? categoryById.get(r.setCategoryId) : undefined;
          return (
            <div key={r.id} className="flex items-center gap-2 rounded-xl glass-inset px-3 py-2">
              <div className="flex flex-col">
                <button aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="pressable text-muted-foreground disabled:opacity-30"><ChevronUp className="size-4" /></button>
                <button aria-label="Move down" disabled={i === ordered.length - 1} onClick={() => move(i, 1)} className="pressable text-muted-foreground disabled:opacity-30"><ChevronDown className="size-4" /></button>
              </div>
              <span className="min-w-0 flex-1 truncate text-sm">
                <span className="text-muted-foreground">{r.matchMode === "contains" ? "contains" : r.matchMode === "startsWith" ? "starts with" : "is"}</span> “{r.matchText}” →{" "}
                {cat ? `${cat.icon} ${cat.name}` : r.setKind ?? ""}{" "}
                {r.setKind && cat ? <span className="text-muted-foreground">· {r.setKind}</span> : null}
                {r.addTagIds.map((id) => <span key={id} className="ml-1 text-xs text-muted-foreground">#{tagById.get(id)?.name ?? id}</span>)}
              </span>
              <Switch checked={r.enabled} onCheckedChange={(v) => upsertRule({ ...r, enabled: v })} aria-label="Enable rule" />
              <button aria-label="Edit rule" onClick={() => setEditing(r)} className="pressable text-muted-foreground"><Pencil className="size-4" /></button>
            </div>
          );
        })}
        {ordered.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No rules yet. Create one or generate suggestions.</p>}
      </Card>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing && editing !== "new" ? "Edit rule" : "New rule"}>
          <RuleEditor rule={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
        </DialogContent>
      </Dialog>

      <Dialog open={showSuggest} onOpenChange={setShowSuggest}>
        <DialogContent title="Suggested rules">
          <RuleSuggestions onApproved={() => setShowSuggest(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={backfill !== null} onOpenChange={(o) => !o && setBackfill(null)}>
        <DialogContent title="Apply rules to existing transactions">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {backfill?.count ?? 0} existing transaction(s) would change. Rows you corrected by hand are skipped.
            </p>
            {backfill?.samples.length ? (
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                {backfill.samples.map((s, i) => <li key={i} className="truncate">• {s.description}</li>)}
              </ul>
            ) : null}
            <div className="flex justify-end gap-2">
              <DialogClose asChild><Button variant="ghost" size="sm">Cancel</Button></DialogClose>
              <DialogClose asChild>
                <Button size="sm" disabled={!backfill?.count} onClick={() => { void applyRuleBackfill(); setBackfill(null); }}>
                  Apply to {backfill?.count ?? 0}
                </Button>
              </DialogClose>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

**Note on the backfill writing path:** `applyRuleBackfill` mutates rows server-side but the client cache won't reflect it until refetch. After `applyRuleBackfill()` resolves, invalidate the dataset query. Simplest: import `useQueryClient` and `DATASET_KEY` and call `qc.invalidateQueries({ queryKey: DATASET_KEY })` in the apply handler. Add:
```tsx
import { useQueryClient } from "@tanstack/react-query";
import { DATASET_KEY } from "@/store/data";
// inside component:
const qc = useQueryClient();
// in the apply onClick:
onClick={async () => { await applyRuleBackfill(); await qc.invalidateQueries({ queryKey: DATASET_KEY }); setBackfill(null); }}
```
(Export `DATASET_KEY` is already a `const` export in `src/store/data.ts`.)

- [ ] **Step 2: Build to typecheck + lint**

Run: `npm run build > /tmp/b.log 2>&1; echo "EXIT=$?"` → `EXIT=0`
Run: `npm run lint > /tmp/l.log 2>&1; echo "EXIT=$?"` → `EXIT=0`

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/rules/page.tsx"
git commit -m "feat(rules): Rules page — list, reorder, toggle, suggestions, backfill"
```

---

## Task 13: Navigation + Settings entry

**Files:**
- Modify: `src/components/nav/nav-items.ts`
- Modify: `src/store/ui.ts`
- Modify: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Register the destination** in `nav-items.ts`

Add `Wand2` to the lucide import, and add to `NAV_REGISTRY` (after `tags`):
```ts
{ key: "rules", href: "/rules", label: "Rules", icon: Wand2 },
```

- [ ] **Step 2: Add `rules` to the default nav config** in `src/store/ui.ts`

Find the default nav config array (the one listing `{ key: "...", primary: ... }` entries, used by `resetNav`/initial state) and add `{ key: "rules", primary: false }` next to the `tags`/`categories` entries. (Persisted configs won't show Rules until the user taps **Reset** in Settings → Navigation; note this in the PR description.)

- [ ] **Step 3: Add a direct link in Settings** — in `src/app/(app)/settings/page.tsx`, add a small section. Add `Link` from `next/link` and `Wand2` to the lucide import, then add a `<RulesSection />` to the page body (after `<NavigationSection />`):
```tsx
function RulesSection() {
  return (
    <Card>
      <SectionLabel className="mb-3">Categorization</SectionLabel>
      <SettingRow
        title="Rules"
        description="Create rules that auto-categorize transactions before the AI runs."
        control={<Link href="/rules" className="pressable inline-flex items-center gap-1.5 rounded-full glass-inset px-3 py-1.5 text-xs font-medium"><Wand2 className="size-3.5" /> Open</Link>}
      />
    </Card>
  );
}
```
And render it in `SettingsPage`'s list.

- [ ] **Step 4: Build + lint**

Run: `npm run build > /tmp/b.log 2>&1; echo "EXIT=$?"` → `EXIT=0`
Run: `npm run lint > /tmp/l.log 2>&1; echo "EXIT=$?"` → `EXIT=0`

- [ ] **Step 5: Commit**

```bash
git add src/components/nav/nav-items.ts src/store/ui.ts "src/app/(app)/settings/page.tsx"
git commit -m "feat(rules): add Rules to nav registry + Settings link"
```

---

## Task 14: Full verification + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Whole suite + lint + build**

Run each WITHOUT pipes and check `$?`:
```bash
npx vitest run > /tmp/t.log 2>&1; echo "TEST=$?"; grep "Tests " /tmp/t.log
npm run lint > /tmp/l.log 2>&1; echo "LINT=$?"
npm run build > /tmp/b.log 2>&1; echo "BUILD=$?"
```
Expected: `TEST=0`, `LINT=0`, `BUILD=0`, all tests passing.

- [ ] **Step 2: Manual smoke (dev server)** — confirm against the live stub data:
  1. Open `/rules` → the 7 seeded rules show (REVOLUT/SEB KORT/AMEX×2/AVANZA/LÖN/LÅN), `lån` shows `#Fixed cost`.
  2. Reorder a rule (arrows) → order persists on reload.
  3. Toggle a rule off → it stops applying.
  4. New rule `contains "stora coop v" → Groceries` → Save → it appears.
  5. **Generate suggestions** → pick `2026-01` → see `ica supermar ×16`, `sl ×8` (flagged risky) etc.; tick a few → Approve → they appear as rules.
  6. **Apply rules to existing…** → preview shows a non-zero count, **skips** January's hand-corrected rows (categorySource user) → Apply → transactions update after refetch.
  7. Import a file containing a `lån …` row → review shows kind Expense, category Mortgage, **#Fixed cost** tag, no LLM call for that row.

- [ ] **Step 3: Push**

```bash
git push
```

---

## Self-review notes (already reconciled against the spec)

- **Reorder control:** spec said "drag to reorder"; this plan uses up/down arrows (matches the existing Settings nav pattern — simpler, no new dep). Behavior (priority order, first-match-wins) is identical.
- **`categorySource`:** rule backfill leaves source as-is for `"model"` rows and **skips** `"user"` rows; no new source value (per spec).
- **Tag-only rules:** `categorizeTransactions` carries `ruleTags` forward and still sends the row to the LLM for a category (per spec's short-circuit mechanic).
- **Coverage:** table+types (T1,T4), engine (T2), suggestions (T3), persistence/store (T5), migration+retire built-ins (T6), import pipeline (T7,T8), backfill (T9), UI (T10–T12), nav/settings (T13), verification (T14).
