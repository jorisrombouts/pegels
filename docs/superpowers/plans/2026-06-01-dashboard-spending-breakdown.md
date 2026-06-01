# Dashboard Spending Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard's category donut with an interactive horizontal-bar "Spending breakdown" widget (Categories | Tags | Accounts toggle, ↑↓% vs last month, tap-to-expand subcategories), fold the account tile into it, drop the Daily Pace tile from the default layout, and re-order the layout by value.

**Architecture:** Three new pure selectors (`withDelta`, `spendBySubcategory`, `spendByTag`) feed delta-annotated rows through the existing `compute.ts` → `DashCtx` → `registry.tsx` pipeline. A new `BreakdownWidget` renders CSS-width bars (reusing `ProgressBar` styling — no Recharts) and deep-links via `onNavigate`. A zustand-persist v3 migration swaps the old widgets out of existing layouts.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Vitest, Zustand (persist).

**Spec:** `docs/superpowers/specs/2026-06-01-dashboard-spending-breakdown-design.md`

---

## Conventions (read once)

- Single test file: `npx vitest run path/to/file.test.ts`. Full suite: `npx vitest run`. Lint: `npm run lint`. Build: `npm run build`.
- **Exit codes:** zsh has no `PIPESTATUS`. Run each command WITHOUT a pipe and read `$?` (e.g. `npx vitest run > /tmp/t.log 2>&1; echo "EXIT=$?"`), then inspect the log. Don't trust `… | tail`.
- Pure selectors live in `src/lib/domain/selectors.ts`; they use `effectiveExpense(tx)` (expense-kind only, split-aware; income/transfers = 0).
- Commit after each task. Branch `main`; pushing authorized (controller pushes).
- The build must stay green at every commit — the task order guarantees this (new compute fields are additive with `*Delta` names; old widgets are removed only after the new one exists).

---

## File Structure

**Create:**
- `src/components/dashboard/breakdown-widget.tsx` — the widget (toggle + bars + expand) and the `SpendBar` row unit.
- `src/components/dashboard/breakdown-widget.test.tsx` — widget render/interaction tests.

**Modify:**
- `src/lib/domain/selectors.ts` — add `WithDelta`, `withDelta`, `spendBySubcategory`, `spendByTag`.
- `src/lib/domain/selectors.test.ts` — tests for the three selectors.
- `src/components/dashboard/compute.ts` — add `byCategoryDelta`, `byTagDelta`, `byAccountDelta`, `subcategoryDeltas`; later remove the old `byCategory`/`byAccount`.
- `src/components/dashboard/registry.tsx` — add `breakdown`; remove `category` + `byaccount`; drop the `CategoryDonut` dynamic import.
- `src/components/dashboard/registry.test.tsx` — update expectations (breakdown present; pace allowed as non-default renderer).
- `src/store/ui.ts` — new `defaultLayout`; add exported `migrateLayoutToV3`; bump persist `version` 2 → 3.
- `src/store/ui.test.ts` (create if absent) — test `migrateLayoutToV3`.

**Delete (Task 6):**
- `src/components/dashboard/category-donut.tsx`, `src/components/dashboard/category-donut.test.tsx`.

---

## Task 1: `withDelta` selector

**Files:**
- Modify: `src/lib/domain/selectors.ts`
- Test: `src/lib/domain/selectors.test.ts`

- [ ] **Step 1: Add the failing test** to `src/lib/domain/selectors.test.ts`

Add `withDelta` to the import on line 2, then append:
```ts
describe("withDelta", () => {
  const A = { id: "a", name: "A" };
  const B = { id: "b", name: "B" };
  const C = { id: "c", name: "C" };
  it("joins current+prev by key and computes pct (null when prev is 0)", () => {
    const cur = [{ item: A, amount: 110 }, { item: B, amount: 50 }, { item: C, amount: 30 }];
    const prev = [{ item: A, amount: 100 }, { item: B, amount: 0 }];
    const out = withDelta(cur, prev, (x) => x.id);
    expect(out.map((r) => r.item.id)).toEqual(["a", "b", "c"]); // current order preserved
    expect(out[0]).toMatchObject({ amount: 110, prevAmount: 100, changePct: 10 });
    expect(out[1]).toMatchObject({ amount: 50, prevAmount: 0, changePct: null }); // prev 0 -> null
    expect(out[2]).toMatchObject({ amount: 30, prevAmount: 0, changePct: null }); // absent in prev -> 0 basis
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/domain/selectors.test.ts > /tmp/t1.log 2>&1; echo "EXIT=$?"`
Expected: non-zero (`withDelta` is not exported).

- [ ] **Step 3: Implement** — add near the top of `src/lib/domain/selectors.ts` (after `buildMaps`, before `orderCategories`):
```ts
export interface WithDelta<T> {
  item: T;
  amount: number;
  prevAmount: number;
  changePct: number | null; // null when prevAmount === 0 (no basis)
}

/** Annotate current rows with their prior-period amount + % change, matched by key. */
export function withDelta<T>(
  current: { item: T; amount: number }[],
  prev: { item: T; amount: number }[],
  keyOf: (item: T) => string,
): WithDelta<T>[] {
  const prevByKey = new Map(prev.map((r) => [keyOf(r.item), r.amount]));
  return current.map((r) => {
    const prevAmount = prevByKey.get(keyOf(r.item)) ?? 0;
    const changePct = prevAmount > 0 ? ((r.amount - prevAmount) / prevAmount) * 100 : null;
    return { item: r.item, amount: r.amount, prevAmount, changePct };
  });
}
```

- [ ] **Step 4: Run to confirm it passes**

Run: `npx vitest run src/lib/domain/selectors.test.ts > /tmp/t1.log 2>&1; echo "EXIT=$?"`
Expected: `EXIT=0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/selectors.ts src/lib/domain/selectors.test.ts
git commit -m "feat(dashboard): withDelta selector (period-over-period % change)"
```

---

## Task 2: `spendBySubcategory` + `spendByTag` selectors

**Files:**
- Modify: `src/lib/domain/selectors.ts`
- Test: `src/lib/domain/selectors.test.ts`

- [ ] **Step 1: Add the failing tests** to `src/lib/domain/selectors.test.ts`

Add `spendBySubcategory, spendByTag` to the import on line 2, and `Tag` to the type import on line 3. Append:
```ts
describe("spendBySubcategory", () => {
  const cats: Category[] = [
    { id: "food", name: "Food", icon: "🍔", color: "0 0% 0%", parentId: null },
    { id: "grocery", name: "Groceries", icon: "🛒", color: "0 0% 0%", parentId: "food" },
    { id: "resto", name: "Restaurants", icon: "🍽️", color: "0 0% 0%", parentId: "food" },
  ];
  const m = buildMaps(cats);
  const t = (id: string | null, amount: number): Transaction => ({
    id: `t${Math.random()}`, date: "2025-03-10", description: "x", amount, accountId: "a",
    categoryId: id, predictedCategoryId: null, categoryConfidence: null, categorySource: "user",
    needsReview: false, tagIds: [], kind: "expense", goalId: null,
  });
  it("groups a parent's spend by immediate subcategory, sorted desc", () => {
    const txs = [t("grocery", -100), t("grocery", -50), t("resto", -200), t("food", -10)];
    const out = spendBySubcategory(txs, m, "food", "2025-03");
    expect(out.map((r) => [r.category.id, r.amount])).toEqual([["resto", 200], ["grocery", 150], ["food", 10]]);
  });
  it("excludes other months and other parents", () => {
    const txs = [t("grocery", -100), { ...t("grocery", -999), date: "2025-02-01" }];
    const out = spendBySubcategory(txs, m, "food", "2025-03");
    expect(out).toEqual([{ category: cats[1], amount: 100 }]);
  });
});

describe("spendByTag", () => {
  const tags: Tag[] = [
    { id: "fix", name: "Fixed", color: "0 0% 0%" },
    { id: "fun", name: "Fun", color: "0 0% 0%" },
  ];
  const t = (amount: number, tagIds: string[]): Transaction => ({
    id: `t${Math.random()}`, date: "2025-03-10", description: "x", amount, accountId: "a",
    categoryId: "c", predictedCategoryId: null, categoryConfidence: null, categorySource: "user",
    needsReview: false, tagIds, kind: "expense", goalId: null,
  });
  it("adds a transaction's spend to every tag it carries (overlap)", () => {
    const txs = [t(-100, ["fix", "fun"]), t(-40, ["fun"]), t(-10, [])];
    const out = spendByTag(txs, tags, "2025-03");
    expect(out).toEqual([{ tag: tags[1], amount: 140 }, { tag: tags[0], amount: 100 }]); // fun 140, fix 100
  });
  it("omits tags with no spend this month", () => {
    expect(spendByTag([t(-100, ["fix"])], tags, "2025-03").map((r) => r.tag.id)).toEqual(["fix"]);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/lib/domain/selectors.test.ts > /tmp/t2.log 2>&1; echo "EXIT=$?"`
Expected: non-zero (selectors not exported).

- [ ] **Step 3: Implement** — add to `src/lib/domain/selectors.ts` right after `spendByRootCategory`/`fallbackCategory` (so `CategorySpend`, `inMonth`, `accountMatches`, `rootCategoryId`, `isInCategory`, `effectiveExpense` are all in scope). Add `Tag` to the type import on line 2 (`import type { Account, Budget, Category, Goal, Tag, Transaction } from "./types";`).
```ts
/** Spend within one top-level category, grouped by the immediate (sub)category, sorted desc. */
export function spendBySubcategory(
  transactions: Transaction[],
  maps: Maps,
  parentId: string,
  key: string,
  accountFilter = "all",
): CategorySpend[] {
  const totals = new Map<string, number>();
  for (const tx of transactions) {
    if (!inMonth(tx, key) || !accountMatches(tx, accountFilter)) continue;
    if (rootCategoryId(tx.categoryId, maps.categoryById) !== parentId) continue;
    const amount = effectiveExpense(tx);
    if (amount === 0) continue;
    const immediate = tx.categoryId ?? parentId; // tx filed directly on the parent counts under it
    totals.set(immediate, (totals.get(immediate) ?? 0) + amount);
  }
  return [...totals.entries()]
    .map(([id, amount]) => ({ category: maps.categoryById.get(id) ?? fallbackCategory(id), amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** Spend per tag for a month — a transaction's full spend counts once per tag it carries. */
export function spendByTag(
  transactions: Transaction[],
  tags: Tag[],
  key: string,
  accountFilter = "all",
): { tag: Tag; amount: number }[] {
  const tagById = new Map(tags.map((t) => [t.id, t]));
  const totals = new Map<string, number>();
  for (const tx of transactions) {
    if (!inMonth(tx, key) || !accountMatches(tx, accountFilter)) continue;
    const amount = effectiveExpense(tx);
    if (amount === 0) continue;
    for (const tagId of tx.tagIds) {
      if (!tagById.has(tagId)) continue;
      totals.set(tagId, (totals.get(tagId) ?? 0) + amount);
    }
  }
  return [...totals.entries()]
    .map(([id, amount]) => ({ tag: tagById.get(id)!, amount }))
    .sort((a, b) => b.amount - a.amount);
}
```
NOTE: verify `accountMatches` exists in this file (it's used by `spendByRootCategory`). If it is module-private and named differently, match the existing helper used by `spendByRootCategory` for the account filter.

- [ ] **Step 4: Run to confirm pass**

Run: `npx vitest run src/lib/domain/selectors.test.ts > /tmp/t2.log 2>&1; echo "EXIT=$?"`
Expected: `EXIT=0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/selectors.ts src/lib/domain/selectors.test.ts
git commit -m "feat(dashboard): spendBySubcategory + spendByTag selectors"
```

---

## Task 3: compute delta fields (additive)

**Files:**
- Modify: `src/components/dashboard/compute.ts`
- Test: `src/components/dashboard/compute.test.ts` (create)

- [ ] **Step 1: Add the failing test** — create `src/components/dashboard/compute.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { computeDashboard } from "./compute";
import { seedDataset } from "@/data/mock";

describe("computeDashboard delta fields", () => {
  const d = computeDashboard(seedDataset, "2025-03", "all", new Date("2025-03-31T12:00:00Z"));
  it("exposes category/tag/account rows with deltas", () => {
    expect(Array.isArray(d.byCategoryDelta)).toBe(true);
    expect(d.byCategoryDelta.length).toBeGreaterThan(0);
    // each row has item + amount + changePct (number | null)
    const row = d.byCategoryDelta[0];
    expect(row.item).toBeTruthy();
    expect(typeof row.amount).toBe("number");
    expect(row.changePct === null || typeof row.changePct === "number").toBe(true);
    expect(Array.isArray(d.byTagDelta)).toBe(true);
    expect(Array.isArray(d.byAccountDelta)).toBe(true);
  });
  it("subcategoryDeltas returns rows for a parent that has spend", () => {
    const parent = d.byCategoryDelta[0].item.id;
    const subs = d.subcategoryDeltas(parent);
    expect(Array.isArray(subs)).toBe(true);
    expect(subs.every((s) => typeof s.amount === "number")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/components/dashboard/compute.test.ts > /tmp/t3.log 2>&1; echo "EXIT=$?"`
Expected: non-zero (fields/function don't exist yet).

- [ ] **Step 3: Implement** — edit `src/components/dashboard/compute.ts`. Extend the imports from `@/lib/domain/selectors`:
```ts
import {
  budgetStatuses,
  buildMaps,
  capitalSummary,
  goalProgress,
  monthProgress,
  monthSpend,
  prevMonthKey,
  spendByAccount,
  spendByRootCategory,
  spendBySubcategory,
  spendByTag,
  withDelta,
} from "@/lib/domain/selectors";
```
Inside `computeDashboard`, after `const prevKey = prevMonthKey(month);` add the delta computations, and add the four fields to the returned object. Insert before the `return {`:
```ts
  const norm = <T,>(rows: { amount: number }[], pick: (r: never) => T) =>
    rows.map((r) => ({ item: pick(r as never), amount: r.amount }));

  const byCategoryDelta = withDelta(
    norm(spendByRootCategory(data.transactions, maps, data.categories, month, accountFilter), (r: { category: unknown }) => r.category),
    norm(spendByRootCategory(data.transactions, maps, data.categories, prevKey, accountFilter), (r: { category: unknown }) => r.category),
    (c: { id: string }) => c.id,
  );
  const byTagDelta = withDelta(
    norm(spendByTag(data.transactions, data.tags, month, accountFilter), (r: { tag: unknown }) => r.tag),
    norm(spendByTag(data.transactions, data.tags, prevKey, accountFilter), (r: { tag: unknown }) => r.tag),
    (t: { id: string }) => t.id,
  );
  const byAccountDelta = withDelta(
    norm(spendByAccount(data.transactions, maps, data.accounts, month), (r: { account: unknown }) => r.account),
    norm(spendByAccount(data.transactions, maps, data.accounts, prevKey), (r: { account: unknown }) => r.account),
    (a: { id: string }) => a.id,
  );
  const subcategoryDeltas = (parentId: string) =>
    withDelta(
      norm(spendBySubcategory(data.transactions, maps, parentId, month, accountFilter), (r: { category: unknown }) => r.category),
      norm(spendBySubcategory(data.transactions, maps, parentId, prevKey, accountFilter), (r: { category: unknown }) => r.category),
      (c: { id: string }) => c.id,
    );
```
Then add to the returned object (keep all existing fields for now):
```ts
    byCategoryDelta,
    byTagDelta,
    byAccountDelta,
    subcategoryDeltas,
```
NOTE on typing: the `norm`/`pick` casts above keep TS quiet without changing the selector return types. If the reviewer/engineer finds the `as never` casts ugly, an equally valid implementation is to type the picks concretely (`(r: { category: Category }) => r.category`) using the selector's real element types imported as needed — either is fine as long as `byCategoryDelta` ends up `WithDelta<Category>[]`, `byTagDelta` `WithDelta<Tag>[]`, `byAccountDelta` `WithDelta<Account>[]`. Prefer the concrete-typed version if it compiles cleanly.

- [ ] **Step 4: Run the compute test + full suite + build**

Run: `npx vitest run src/components/dashboard/compute.test.ts > /tmp/t3.log 2>&1; echo "EXIT=$?"` → `EXIT=0`
Run: `npx vitest run > /tmp/t3all.log 2>&1; echo "EXIT=$?"; grep "Tests " /tmp/t3all.log` → `EXIT=0` (additive change; nothing broke)
Run: `npm run build > /tmp/t3b.log 2>&1; echo "EXIT=$?"` → `EXIT=0`

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/compute.ts src/components/dashboard/compute.test.ts
git commit -m "feat(dashboard): compute category/tag/account spend deltas"
```

---

## Task 4: BreakdownWidget + SpendBar

**Files:**
- Create: `src/components/dashboard/breakdown-widget.tsx`
- Test: `src/components/dashboard/breakdown-widget.test.tsx`

- [ ] **Step 1: Implement the widget** — create `src/components/dashboard/breakdown-widget.tsx`

```tsx
"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { formatSEKAbs, formatSignedPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DashCtx } from "./registry";
import type { WidgetSize } from "@/store/ui";
import type { WithDelta } from "@/lib/domain/selectors";

type Mode = "categories" | "tags" | "accounts";
const MODES: { value: Mode; label: string }[] = [
  { value: "categories", label: "Categories" },
  { value: "tags", label: "Tags" },
  { value: "accounts", label: "Accounts" },
];

/** A coloured ↑/↓/→ chip; hidden entirely when there's no prior-period basis. */
function DeltaChip({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const dir = pct > 2 ? "up" : pct < -2 ? "down" : "flat";
  const color = dir === "up" ? "hsl(var(--negative))" : dir === "down" ? "hsl(var(--positive))" : "hsl(var(--muted-foreground))";
  const Icon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : ArrowRight;
  return (
    <span className="tnum inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold" style={{ color }}>
      <Icon className="size-3.5" />
      {formatSignedPct(pct)}
    </span>
  );
}

function SpendBar({
  icon, name, amount, pctOfMax, color, changePct, masked, indent, onBar, onLabel,
}: {
  icon: string; name: string; amount: number; pctOfMax: number; color: string;
  changePct: number | null; masked: boolean; indent?: boolean;
  onBar?: () => void; onLabel?: () => void;
}) {
  return (
    <div className={cn("py-1.5", indent && "pl-5")}>
      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
        <button onClick={onLabel} className="pressable flex min-w-0 items-center gap-2 text-left hover:underline">
          <span className="shrink-0">{icon}</span>
          <span className="truncate">{name}</span>
        </button>
        <span className="flex shrink-0 items-center gap-2">
          <DeltaChip pct={changePct} />
          <span className="tnum text-muted-foreground">{formatSEKAbs(amount, masked)}</span>
        </span>
      </div>
      <button onClick={onBar} className="block w-full" aria-label={`Expand ${name}`}>
        <ProgressBar pct={pctOfMax} color={color} height={6} />
      </button>
    </div>
  );
}

const catColor = (c: { color: string }) => `hsl(${c.color})`;

export function BreakdownWidget({ ctx, size }: { ctx: DashCtx; size: WidgetSize }) {
  const { d, masked, onNavigate } = ctx;
  const [mode, setMode] = useState<Mode>("categories");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const isSmall = size === "small";

  const subRows = useMemo(
    () => (expandedId ? d.subcategoryDeltas(expandedId) : []),
    [expandedId, d],
  );

  // Pick the active row set + how to render each item.
  let rows: WithDelta<{ id: string; color: string }>[];
  let render: (r: WithDelta<{ id: string; color: string }>) => { icon: string; name: string; href: string };
  let expandable = false;
  if (mode === "tags") {
    rows = d.byTagDelta as never;
    render = (r) => ({ icon: "🏷️", name: (r.item as never as { name: string }).name, href: `/transactions?tag=${r.item.id}` });
  } else if (mode === "accounts") {
    rows = d.byAccountDelta as never;
    render = (r) => ({ icon: (r.item as never as { icon: string }).icon, name: (r.item as never as { name: string }).name, href: `/transactions?account=${r.item.id}` });
  } else {
    rows = d.byCategoryDelta as never;
    render = (r) => ({ icon: (r.item as never as { icon: string }).icon, name: (r.item as never as { name: string }).name, href: `/transactions?category=${r.item.id}` });
    expandable = true;
  }

  const shown = isSmall ? rows.slice(0, 4) : rows;
  const max = rows.reduce((m, r) => Math.max(m, r.amount), 0) || 1;

  const empty =
    mode === "tags" ? "No tagged spending this month." : "No spending this month.";

  return (
    <Card className="h-full">
      <CardHeader label="Spending breakdown" />

      {!isSmall && (
        <div className="mb-3 flex gap-1 rounded-full glass-inset p-1">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => { setMode(m.value); setExpandedId(null); }}
              className={cn(
                "pressable flex-1 rounded-full px-3 py-1.5 text-xs font-medium",
                mode === m.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="divide-y divide-[hsl(var(--glass-border))]">
          {shown.map((r) => {
            const meta = render(r);
            const expanded = expandable && expandedId === r.item.id;
            return (
              <div key={r.item.id}>
                <SpendBar
                  icon={meta.icon}
                  name={meta.name}
                  amount={r.amount}
                  pctOfMax={r.amount / max}
                  color={catColor(r.item)}
                  changePct={r.changePct}
                  masked={masked}
                  onLabel={() => onNavigate(meta.href)}
                  onBar={expandable && !isSmall ? () => setExpandedId(expanded ? null : r.item.id) : () => onNavigate(meta.href)}
                />
                {expanded && subRows.length > 0 && (
                  <div className="pb-1">
                    {subRows.map((s) => {
                      const subMax = subRows.reduce((m, x) => Math.max(m, x.amount), 0) || 1;
                      return (
                        <SpendBar
                          key={s.item.id}
                          icon={s.item.icon}
                          name={s.item.name}
                          amount={s.amount}
                          pctOfMax={s.amount / subMax}
                          color={catColor(s.item)}
                          changePct={s.changePct}
                          masked={masked}
                          indent
                          onLabel={() => onNavigate(`/transactions?category=${s.item.id}`)}
                          onBar={() => onNavigate(`/transactions?category=${s.item.id}`)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {mode === "tags" && <p className="pt-2 text-[11px] text-muted-foreground">Tags can overlap — totals don’t sum to your monthly spend.</p>}
        </div>
      )}
    </Card>
  );
}
```
NOTE: `subcategoryDeltas`, `byCategoryDelta`, `byTagDelta`, `byAccountDelta` are added to `d` in Task 3, so `DashCtx["d"]` already carries them by the time this compiles. The `as never` casts bridge the heterogeneous item types (Category/Tag/Account all have `id`; Category/Account have `icon`; all have `color` except Tag — Tag has `color` too). If the engineer prefers, replace the cast-heavy union with a small per-mode `if` that maps each list to a concrete `{id,name,icon,color,href,changePct,amount}[]` before rendering — functionally identical, just more verbose. Tags have no `icon`, hence the literal `🏷️`.

- [ ] **Step 2: Add the failing test** — create `src/components/dashboard/breakdown-widget.test.tsx`

```tsx
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BreakdownWidget } from "./breakdown-widget";
import { computeDashboard } from "./compute";
import { seedDataset } from "@/data/mock";
import { buildMaps, categoryTrends, dailySpend } from "@/lib/domain/selectors";
import type { DashCtx } from "./registry";

function ctx(onNavigate = () => {}): DashCtx {
  const maps = buildMaps(seedDataset.categories);
  const month = "2025-03";
  return {
    d: computeDashboard(seedDataset, month, "all", new Date("2025-03-31T12:00:00Z")),
    masked: false, month, categoryById: maps.categoryById,
    recent: [], trend: categoryTrends(seedDataset.transactions, maps, seedDataset.categories, month, 6),
    daily: dailySpend(seedDataset.transactions, maps, month), onNavigate,
  };
}

describe("BreakdownWidget", () => {
  it("renders category bars by default and switches to tags via the toggle", () => {
    render(<BreakdownWidget ctx={ctx()} size="large" />);
    expect(screen.getByText("Food & Drinks")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Tags"));
    expect(screen.getByText(/Tags can overlap/i)).toBeInTheDocument();
  });

  it("expands a category into subcategories on bar tap", () => {
    render(<BreakdownWidget ctx={ctx()} size="large" />);
    fireEvent.click(screen.getByLabelText("Expand Food & Drinks"));
    // a Food subcategory (e.g. Groceries or Restaurants) now appears
    expect(screen.getByText(/Groceries|Restaurants/)).toBeInTheDocument();
  });

  it("deep-links on label tap", () => {
    const onNavigate = vi.fn();
    render(<BreakdownWidget ctx={ctx(onNavigate)} size="large" />);
    fireEvent.click(screen.getByText("Food & Drinks"));
    expect(onNavigate).toHaveBeenCalledWith(expect.stringContaining("/transactions?category="));
  });

  it("hides the toggle at small size", () => {
    render(<BreakdownWidget ctx={ctx()} size="small" />);
    expect(screen.queryByText("Tags")).not.toBeInTheDocument();
  });
});
```
NOTE: confirm seed `2025-03` has a top-level "Food & Drinks" category with spend (it does — ICA/restaurants in March) and tagged transactions (tag-fixed/tag-partner in March). If the exact top-category label differs, adjust the asserted strings to the actual top row — but do NOT weaken the toggle/expand/deeplink assertions.

- [ ] **Step 3: Run the widget test**

Run: `npx vitest run src/components/dashboard/breakdown-widget.test.tsx > /tmp/t4.log 2>&1; echo "EXIT=$?"`
Expected: `EXIT=0`. If a label assertion mismatches the seed, read the rendered output in the log and fix the asserted string (not the behavior).

- [ ] **Step 4: Lint + build**

Run: `npm run lint > /tmp/t4l.log 2>&1; echo "EXIT=$?"` → `EXIT=0`
Run: `npm run build > /tmp/t4b.log 2>&1; echo "EXIT=$?"` → `EXIT=0`

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/breakdown-widget.tsx src/components/dashboard/breakdown-widget.test.tsx
git commit -m "feat(dashboard): BreakdownWidget (bars, category/tag/account toggle, expand)"
```

---

## Task 5: Registry swap + value-ordered layout + v3 migration

**Files:**
- Modify: `src/components/dashboard/registry.tsx`
- Modify: `src/components/dashboard/registry.test.tsx`
- Modify: `src/store/ui.ts`
- Test: `src/store/ui.test.ts` (create)

- [ ] **Step 1: Wire the widget into the registry** — `src/components/dashboard/registry.tsx`

1. Remove the `CategoryDonut` dynamic import block (the `const CategoryDonut = dynamic(...)` near the top) and, if `dynamic` is now unused, remove its import (`import dynamic from "next/dynamic";`).
2. Add an import: `import { BreakdownWidget } from "./breakdown-widget";`
3. In `widgetTitles`, remove the `category` and `byaccount` lines, add `breakdown: "Spending breakdown",`.
4. In `widgets`, delete the entire `category:` renderer and the entire `byaccount:` renderer; add:
```ts
  breakdown: (ctx, size) => <BreakdownWidget ctx={ctx} size={size} />,
```

- [ ] **Step 2: Update the default layout + migration** — `src/store/ui.ts`

Replace `defaultLayout` (lines ~18-28) with:
```ts
export const defaultLayout: WidgetLayout[] = [
  { id: "total", size: "large" },
  { id: "breakdown", size: "large" },
  { id: "budgets", size: "medium" },
  { id: "goals", size: "medium" },
  { id: "trend", size: "large" },
  { id: "recent", size: "medium" },
  { id: "calendar", size: "medium" },
];
```
Add an exported pure migration helper (place it just after `defaultLayout`):
```ts
/** v3: rename the donut slot to breakdown, drop the removed byaccount/pace tiles, append new defaults. */
export function migrateLayoutToV3(layout: WidgetLayout[]): WidgetLayout[] {
  const moved = layout
    .map((w) => (w.id === "category" ? { ...w, id: "breakdown" } : w))
    .filter((w) => w.id !== "byaccount" && w.id !== "pace");
  const known = new Set(moved.map((w) => w.id));
  return [...moved, ...defaultLayout.filter((w) => !known.has(w.id))];
}
```
Bump the persist `version` from `2` to `3`, and replace the `migrate` body to use the helper:
```ts
      version: 3,
      partialize: (s) => ({ masked: s.masked, month: s.month, accountFilter: s.accountFilter, layout: s.layout, navConfig: s.navConfig }),
      migrate: (persisted) => {
        const state = persisted as Partial<UIState> | undefined;
        if (!state?.layout) return state as UIState;
        return { ...state, layout: migrateLayoutToV3(state.layout) } as UIState;
      },
```

- [ ] **Step 3: Update the registry test** — `src/components/dashboard/registry.test.tsx`

The "does not define orphan renderers without a layout slot" test must now allow `pace` (registered but intentionally not in the default layout). Replace that `it(...)` block with:
```ts
  it("only registers renderers in the default layout (except intentionally-parked widgets)", () => {
    const layoutIds = new Set(defaultLayout.map((w) => w.id));
    const parked = new Set(["pace"]); // kept registered, re-addable via Edit layout
    for (const id of Object.keys(widgets)) {
      expect(layoutIds.has(id) || parked.has(id), `renderer "${id}" not in default layout`).toBe(true);
    }
  });
```
(The other two tests — "renderer + title for every default widget" and "every widget renders at every size" — stay as-is; they now exercise `breakdown` through the real seed ctx.)

- [ ] **Step 4: Add the migration test** — create `src/store/ui.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { migrateLayoutToV3, defaultLayout } from "./ui";

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
    // breakdown keeps category's old size (medium), not the default large
    expect(out.find((w) => w.id === "breakdown")?.size).toBe("medium");
    // missing defaults (e.g. goals, trend) are appended
    for (const w of defaultLayout) expect(ids).toContain(w.id);
  });
});
```

- [ ] **Step 5: Run tests + lint + build**

Run: `npx vitest run > /tmp/t5.log 2>&1; echo "EXIT=$?"; grep "Tests " /tmp/t5.log` → `EXIT=0` (registry.test renders breakdown; donut test still exists but passes — it's deleted in Task 6)
Run: `npm run lint > /tmp/t5l.log 2>&1; echo "EXIT=$?"` → `EXIT=0`
Run: `npm run build > /tmp/t5b.log 2>&1; echo "EXIT=$?"; grep -c "category-donut\|byaccount" /tmp/t5b.log` → `EXIT=0`

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/registry.tsx src/components/dashboard/registry.test.tsx src/store/ui.ts src/store/ui.test.ts
git commit -m "feat(dashboard): swap donut->breakdown, value-ordered layout, v3 migration"
```

---

## Task 6: Cleanup — remove donut + dead compute fields + Recharts check

**Files:**
- Delete: `src/components/dashboard/category-donut.tsx`, `src/components/dashboard/category-donut.test.tsx`
- Modify: `src/components/dashboard/compute.ts`

- [ ] **Step 1: Delete the donut files**

```bash
git rm src/components/dashboard/category-donut.tsx src/components/dashboard/category-donut.test.tsx
```

- [ ] **Step 2: Remove now-dead compute fields** — in `src/components/dashboard/compute.ts`, the old `byCategory: spendByRootCategory(...)` and `byAccount: spendByAccount(...)` fields in the returned object are no longer read by any widget (donut/byaccount removed). Confirm with a grep, then remove them:

Run: `grep -rn "\.byCategory\b\|\.byAccount\b" src --include=*.tsx --include=*.ts | grep -v "byCategoryDelta\|byAccountDelta" > /tmp/t6grep.log 2>&1; cat /tmp/t6grep.log`
- If the only remaining references are the definitions inside `compute.ts`, remove the two old fields from the returned object (keep `byCategoryDelta`/`byAccountDelta`). If `spendByRootCategory`/`spendByAccount` imports become unused in compute.ts, leave them — they ARE still used by the new delta computations. Do NOT remove `prevKey` (used by the hero + deltas).
- If any OTHER file still reads `.byCategory`/`.byAccount`, update it to the `*Delta` field (report which).

- [ ] **Step 3: Recharts usage check** — the donut was the main Recharts consumer; the trend widget is hand-rolled SVG.

Run: `grep -rn "recharts" src > /tmp/t6r.log 2>&1; cat /tmp/t6r.log; echo "---"; echo "matches: $(grep -c recharts /tmp/t6r.log)"`
- If there are **zero** matches under `src`, remove the dependency: `npm uninstall recharts > /tmp/t6un.log 2>&1; echo "EXIT=$?"` and note it in the commit.
- If there are matches (Recharts still used somewhere), leave the dependency installed. Report the finding either way.

- [ ] **Step 4: Full verification**

Run: `npx vitest run > /tmp/t6t.log 2>&1; echo "TEST=$?"; grep "Tests " /tmp/t6t.log` → `TEST=0`
Run: `npm run lint > /tmp/t6l.log 2>&1; echo "LINT=$?"` → `LINT=0`
Run: `npm run build > /tmp/t6b.log 2>&1; echo "BUILD=$?"` → `BUILD=0`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(dashboard): remove category donut + dead compute fields (+recharts if unused)"
```

---

## Task 7: Manual smoke + push

**Files:** none (verification only)

- [ ] **Step 1: Manual smoke** (dev server already runs on :3000; restart if needed):
  1. Dashboard leads with **This month** then **Spending breakdown**.
  2. Breakdown shows category bars sorted by spend, each with ↑↓% (red up / green down / grey flat; no chip when last month was 0).
  3. Toggle **Tags** → tag bars + the "overlap" hint; **Accounts** → account bars.
  4. Tap a category bar → expands to subcategory bars; tap again collapses.
  5. Tap a bar's **label** → opens `/transactions` filtered to that category/tag/account.
  6. No donut, no "Spend by account", no "Daily Pace" tile by default. Existing persisted layout shows the breakdown widget without a manual Reset.

- [ ] **Step 2: Push**

```bash
git push
```

---

## Self-review notes (reconciled against the spec)

- **Comparison = previous month, % + arrow only:** `withDelta` uses `prevKey` (prev calendar month); `DeltaChip` shows `formatSignedPct` + arrow, no kr. ✓
- **Color rule (up=red/down=green/flat±2%=grey, hidden when prev 0):** `DeltaChip` (`pct>2`/`pct<-2`/else; `pct===null` → null). ✓
- **Three-way toggle, categories expandable only:** `BreakdownWidget` modes; `expandable` true only for categories; lazy `subcategoryDeltas` via `useMemo`. ✓
- **Fold accounts in / remove byaccount / remove donut / drop pace from default / reorder:** Tasks 5–6 + new `defaultLayout`. ✓
- **Persisted-layout migration without manual reset:** `migrateLayoutToV3` + version bump 2→3. ✓
- **No Recharts in the new widget; remove dep if fully unused:** CSS bars via `ProgressBar`; Task 6 step 3 conditional uninstall. ✓
- **Tags overlap hint, empty states:** present. ✓
- **Selectors pure + tested; widget tested; migration tested:** Tasks 1–5. ✓
- **Type names consistent across tasks:** `WithDelta<T>`, `withDelta`, `spendBySubcategory`, `spendByTag`, `byCategoryDelta`/`byTagDelta`/`byAccountDelta`/`subcategoryDeltas`, `migrateLayoutToV3`, `BreakdownWidget`. ✓
