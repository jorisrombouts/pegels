# Dashboard spending breakdown + value-ordered layout — design

- **Date:** 2026-06-01
- **Project:** pegels (Next.js + Neon/Drizzle personal-finance PWA)
- **Status:** Approved (brainstorm), ready for implementation plan

## Context

The dashboard underwhelms the user. The `category` widget is a donut + top-5 list showing
**amounts only — no change** vs the prior period, and it covers only top-level categories.
There is **no tag spending** anywhere. A review of every widget found two low-value tiles:
`pace` ("Daily Pace") largely **duplicates** the `total` hero (which already shows
safe-to-spend/day and budget remaining), and `byaccount` ("Spend by account") is marginal
with ~2 accounts and is already a filter on the Transactions page.

The user wants to **directly see spend per category and per tag, whether each is up or down
vs last month, and click around to explore** — and prefers **bar charts over the donut**.

## Goals

- An **interactive bar-chart widget** ("Spending breakdown") replacing the donut, with a
  **[ Categories | Tags | Accounts ]** toggle, each row showing spend + a color-coded
  **↑↓ % vs last month**, and **tap-to-expand** a category into its subcategories.
- Fold the standalone account tile into the new widget's **Accounts** mode.
- Remove the redundant **Daily Pace** tile from the default layout.
- **Reorder** the default layout so high-value tiles lead.

## Non-goals (YAGNI)

- No dedicated `/spending` explorer page, no cross-filtering chips (noted as possible future
  work). One dashboard widget.
- No absolute-kr delta on the row — the **bar value is the absolute spend**; the delta is
  **percentage + arrow** only (the user's chosen format).
- No 3-month-average comparison — **previous calendar month** only.
- No expand for Tags or Accounts (they have no children).
- Keep the `pace` widget **registered** (re-addable via Edit layout); only remove it from the
  default layout. Do not delete it.

## Decisions

| Topic | Decision |
|---|---|
| Chart type | Horizontal CSS-width bars (reuse `ProgressBar` styling); **no Recharts** |
| Comparison | This month vs **previous calendar month**, per row |
| Delta display | **Percentage + arrow**, color-coded: up = negative(red), down = positive(green), flat (±2%) = grey; **hidden when prior month is 0** (no basis) |
| Toggle | `[ Categories | Tags | Accounts ]`, segmented control; default Categories |
| Categories | Top-level, **tap a bar to expand** into its subcategories (each with its own delta); tap again to collapse |
| Tags | Flat list; overlapping (a transaction's full spend counts once per tag); show a "tags can overlap" hint |
| Accounts | Flat list of spending accounts (replaces `byaccount` tile) |
| Label click | Deep-links to `/transactions?category=…` / `?tag=…` / `?account=…` |
| Sizing | small = top 4 bars, no toggle/expand; medium/large = full interactive |
| Removed tiles | `byaccount` (deleted), `category`/donut (replaced); `pace` removed from default layout but kept in registry |

## Data layer (`src/lib/domain/selectors.ts`)

All pure, unit-tested, using the existing `effectiveExpense` rule (expense-kind only,
split-aware; income/transfers contribute 0).

### New: generic delta helper
```ts
export interface WithDelta<T> { item: T; amount: number; prevAmount: number; changePct: number | null; }
/** Join current+prev rows by a key; changePct = prev>0 ? (cur-prev)/prev*100 : null. */
export function withDelta<T>(
  current: { item: T; amount: number }[],
  prev: { item: T; amount: number }[],
  keyOf: (item: T) => string,
): WithDelta<T>[];
```
- Iterates `current`; looks up the matching prev amount (0 if absent). Preserves `current`
  order (already sorted desc by the caller). `changePct` is `null` when `prevAmount === 0`
  (renders no arrow). A row present last month but not this month is **not** added (we only
  annotate what's spent this month) — acceptable for an at-a-glance widget.
- **Input shape:** the existing selectors return `{category, amount}` / `{tag, amount}` /
  `{account, amount}`. The compute layer normalizes each to `{item, amount}` before calling
  `withDelta` (e.g. `byCat.map((r) => ({ item: r.category, amount: r.amount }))`), so
  `withDelta` stays generic and the widget reads `row.item` uniformly across all three modes.

### New: subcategory spend
```ts
export function spendBySubcategory(
  transactions: Transaction[], maps: Maps, parentId: string, key: string, accountFilter?: string,
): CategorySpend[];
```
- Sums `effectiveExpense` for transactions whose category's root is `parentId`, grouped by
  the **immediate** category (the subcategory, or the parent itself if a tx is filed directly
  on the parent), sorted desc. Reuses `rootCategoryId`/`isInCategory` logic.

### New: tag spend
```ts
export function spendByTag(
  transactions: Transaction[], tags: Tag[], key: string, accountFilter?: string,
): { tag: Tag; amount: number }[];
```
- For each in-month, account-matching transaction, add its `effectiveExpense` to **every**
  tag in `tx.tagIds`. Returns `{ tag, amount }` for tags with amount > 0, sorted desc.
  (Overlap is expected; totals do not sum to the month total.)

### Reused
- `spendByRootCategory(...)` (categories, current + prev month).
- `spendBySubcategory(...)` per expanded parent (current + prev).
- `spendByAccount(...)` (accounts; add a prev-month call for the delta).

## Compute layer (`src/components/dashboard/compute.ts`)

Add to the returned object (all via `withDelta` against `prevKey`, which already exists):
- `byCategory` → `WithDelta<Category>[]` (replaces the plain `byCategory`).
- `byTag` → `WithDelta<Tag>[]`.
- `byAccount` → `WithDelta<Account>[]` (replaces the plain `byAccount`).
- **Subcategory deltas are computed lazily in the widget**, only for the expanded parent. To
  enable this, `DashCtx`/compute exposes the raw inputs the widget needs: `transactions`,
  `maps` (or `categories`), `month`, and `prevKey`. On expand, the widget computes
  `withDelta(spendBySubcategory(txs, maps, parentId, month), spendBySubcategory(txs, maps,
  parentId, prevKey), (c) => c.id)` inside a `useMemo` keyed by `expandedId`. This avoids
  computing every parent's children up front.

## Components (`src/components/dashboard/`)

### `breakdown-widget.tsx` (new)
- Props from `DashCtx` + `size`. Local state: `mode: "categories"|"tags"|"accounts"` and
  `expandedId: string | null`.
- Renders the segmented toggle (hidden at `size==="small"`), then the bar list for the active
  mode. Categories mode: each row is tappable to set/clear `expandedId`; when expanded, its
  subcategory rows render indented beneath it.
- Deep-links via `onNavigate` (same pattern as today's widgets).
- Empty states per mode ("No spending this month." / "No tagged spending this month.").

### `SpendBar` (new, small presentational unit — colocated or its own file)
```ts
function SpendBar({ icon, name, amount, pctOfMax, color, changePct, masked, indent, onBar, onLabel }): JSX
```
- One row: optional indent, icon+name (label = `onLabel` deep-link), the CSS bar
  (`width: pctOfMax`), the formatted amount, and a delta chip (`↑/↓/→` + `formatSignedPct`)
  colored by direction, omitted when `changePct == null`. `onBar` toggles expand (categories).
- This is the single reused unit across all three modes and the subcategory rows.

### Registry (`registry.tsx`)
- Remove the `category` and `byaccount` entries and the `CategoryDonut` dynamic import.
- Add `breakdown: (ctx, size) => <BreakdownWidget ... />`.
- `widgetTitles`: drop `category`/`byaccount`, add `breakdown: "Spending breakdown"`.

### Removed files
- `category-donut.tsx` + `category-donut.test.tsx`. After removal, check whether Recharts is
  still imported anywhere (the trend widget is hand-rolled SVG, so Recharts may become fully
  unused). If unused, remove the dependency; if still used, leave it. (Plan verifies via grep.)

## Layout & migration (`src/store/ui.ts`)

### New `defaultLayout` (value-ordered)
```ts
{ id: "total", size: "large" },
{ id: "breakdown", size: "large" },
{ id: "budgets", size: "medium" },
{ id: "goals", size: "medium" },
{ id: "trend", size: "large" },
{ id: "recent", size: "medium" },
{ id: "calendar", size: "medium" },
```
(`pace` is no longer in the default; it stays in the registry. `byaccount`/`category` are gone.)

### Persisted-state migration (bump `version` 2 → 3)
The current `migrate` only appends new widgets. Add a v3 step that, for persisted layouts:
1. **Renames** any `category` widget id → `breakdown` (preserves its size/position).
2. **Removes** `byaccount` entries (its tile is gone).
3. **Removes** `pace` from the **layout** (not the registry) — it drops off existing
   dashboards too, consistent with the new default. (Re-addable via Edit layout.)
4. Then the existing append step adds any still-missing default widgets (so `breakdown`
   appears for anyone who didn't have `category`).
This guarantees existing users see the breakdown widget without a manual Reset, and the two
removed tiles disappear cleanly.

## Testing

- **Selectors:** `spendBySubcategory` (groups by immediate sub; parent-direct tx handled),
  `spendByTag` (overlap: one tx with two tags adds to both; untagged excluded),
  `withDelta` (match by key, prev=0 → null, ordering preserved, missing-prev → 0 basis).
- **Compute:** `byCategory`/`byTag`/`byAccount` carry deltas; prev-month wiring correct.
- **`breakdown-widget`:** toggle switches the list; tapping a category expands its
  subcategories and tapping again collapses; tags/accounts don't expand; delta arrow/color by
  direction; arrow hidden when prev is 0; small size hides toggle + caps at 4 bars; label
  deep-link hrefs correct per mode.
- **Migration:** a persisted v2 layout with `category`+`byaccount`+`pace` migrates to one with
  `breakdown` (in category's slot), no `byaccount`, no `pace`.
- Update/replace the existing `registry.test.tsx` and remove `category-donut.test.tsx`.

## Verification

`npm test` + `npm run lint` + `npm run build` green. Manual: dashboard leads with This month →
Spending breakdown; the breakdown toggles Categories/Tags/Accounts; a category expands to
subcategories with their own ↑↓%; deltas are red(up)/green(down)/grey(flat) and absent when
last month was 0; label taps open the right filtered Transactions view; no donut, no Daily
Pace, no Spend-by-account tiles by default; an existing persisted layout shows the breakdown
widget without a manual reset.

## Out of scope (noted)

- `/spending` explorer page with cross-filtering chips and a month switcher (possible future).
- Absolute-kr delta, 3-month-average comparison, sparklines on rows.
- Deleting the `pace` widget entirely (kept registered).
