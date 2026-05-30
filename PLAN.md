# Saldo — Rebuild as PWA (Next.js + Neon + OpenAI)

> **Current status — 2026-05-30** (header added after recovering this plan from session
> history; the log below is the verbatim historical record and still says "Saldo" — the
> project is now **pegels**. Several items it marks TODO/PLANNED have since shipped, and the
> core spending invariant in the Context below has since **changed** — see the ⚠️ note.)
>
> **All UI-first work is complete** — 174 tests passing, build + lint clean, deployed against
> Neon (migrated + seeded). Built since the log was last written:
> - Dashboard polish batch #3–#6 (trend line morph, "This month" button via
>   `month-switcher.tsx`, hero "This month" widget, recurated default layout).
> - **Settings → customizable nav bar** — fully built (`navConfig` store + `NavigationSection`
>   with reorder + primary cap).
> - **Budget forecasts** (history-blended, current-month-only) — `budgetForecasts()` in
>   `selectors.ts`, surfaced on `/budgets` (projected total + per-row trending/on-track).
> - **✅ Phase 4a — Neon Postgres + Drizzle data layer** — Neon is now the source of truth.
>   Server-owned layer (`src/lib/db/` schema + `queries.ts`, `src/app/actions/data.ts` server
>   actions) with cascades preserved; `useData()` rewritten as a TanStack Query facade (same
>   shape, optimistic updates, offline-read cache). Stub `getUserId()` is the auth seam.
>   Scripts: `db:push` / `db:seed`.
> - **✅ Transaction roles, transaction-driven goals, hidden income** (spec + plan in
>   `docs/superpowers/`, 2026-05-29; 12 commits; verified live against Neon). **⚠️ This
>   supersedes the `effectiveExpense` invariant described in the Context below:**
>     - Every transaction now has `kind: "expense" | "income" | "transfer"` (+ optional
>       `goalId`). The `ignored` flag and the savings-account exemption are **removed** —
>       `effectiveExpense` counts a tx **iff `kind === "expense"`** (split → `mine` only).
>     - **Transfers** (e.g. SEB→Revolut/savings) count as neither expense nor income; CSV
>       import **auto-detects** transfer pairs against existing transactions (no double-count).
>     - **Goals are transaction-driven**: `goalSaved = baseline + Σ|linked transfer amounts|`;
>       `Goal.contributions[]` removed. Mark a transfer "→ goal" in the detail panel.
>     - **Income never counts**; no dashboard stat, "Net" → "Spent". (Display since refined —
>       see the real-bank-import item below.)
> - **✅ Real bank import + OpenAI categorization + training set** (spec/plan in
>   `docs/superpowers/` & `.claude/plans/`, 2026-05-30; 10 commits; verified live on a real SEB
>   305-row export + live OpenAI + Neon):
>     - **Money is now decimal** — all amounts `numeric(12,2)`, shown in Swedish notation
>       (`100,75 kr`); inputs parse `100,75`.
>     - **Real SEB parser** — dot-decimal `Belopp`, merchant descriptions cleaned of the
>       trailing `/YY-MM-DD`; realistic sample CSV.
>     - **Category taxonomy expanded** to 23 (Mortgage, Insurance, Travel, Shopping, …).
>     - **OpenAI categorization** (`gpt-4o-mini` structured output → `{kind, categoryId,
>       confidence}`) in `src/lib/ai/` + `src/app/actions/ai.ts`, with deterministic rules
>       (Revolut/SEB-Kort/Amex/Avanza→transfer, LÖN→income, LÅN→expense/Mortgage) + keyword
>       fallback; wired async into the import review step.
>     - **Training set** — Neon `categorization_examples` logs prediction-vs-correction (import
>       + detail edits); recent corrections feed back as few-shot examples (self-improving).
>     - **Income display** — rows stay visible with the **amount always masked**; the detail
>       panel reveals it; changing Type un-masks (`getUserId()` still the single-user stub).
>
> **Still left to implement (Phase 4b+):**
> - **Auth.js Google sign-in** — make `getUserId()` (`src/lib/auth.ts`) read the real session.
> - **Vercel deploy** (Neon + OpenAI env vars); **overspend alerts via PWA Web Push** (deferred).
> - **Light-theme ("Silver Slate") polish** — deferred.
> - Optional follow-ups: offline **write** queue/replay; dashboard "Budgets" widget forecast;
>   recurring-charge-aware forecasting; better classification of bare-number internal transfers.
> - **Persist dashboard layout + nav config per user** (future) — the widget order/sizes
>   (`layout`) and `navConfig` currently live in the Zustand UI store (localStorage, per-browser).
>   Move them into Neon keyed by `getUserId()` so the layout follows the user across devices.
>   (Not to be implemented yet — recorded for later.)

## Context

Saldo is a single-user Swedish personal-finance app (spend analysis & control) that
exists today only as a Lovable UI prototype. We are **rebuilding it from scratch** so it
can be a **PWA**, deploy on **Vercel**, use **Neon Postgres** for data, and **OpenAI** for
transaction categorization.

Decisions confirmed with the user:
- **Rebuild fresh from screenshots** (no Lovable code import). Screenshots will guide the
  visual layer; they are *not* required to start scaffolding/domain work.
- **Next.js App Router** + TypeScript.
- **UI-first**: build the full UI against a mock-data layer, then swap in Neon + OpenAI
  behind the same data contract. This preserves the PRD's UI-first philosophy.
- **Google auth via Auth.js**, but **deferred** — start with a single stub user.

The central correctness invariant from the PRD (§5.7, §7.1) is `effectiveExpense(tx)`:
a transaction counts as spending iff `amount < 0` AND `!ignored` AND its account is not
`savings`; if split, only the `mine` portion counts. **Every SEK figure in the app routes
through this.** Revolut is just another account under this same rule (transfers to it are
not expenses; salary counts once as income on the main account).

New scope from user context that extends the PRD (all folded in): budget **health**
signals ("higher than usual for this day-of-month / on track / below average"), **alerts**
on overspend (PWA push), **forecasts** per-budget and overall, a **"relative highest
budget"** widget (share-of-month-spend per budget), budgets that target **top OR sub
categories**, and an **LLM training set** built from correct + later-corrected categories.

## Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 15 App Router, TS | PWA + Vercel + server route handlers for DB/LLM |
| Styling | Tailwind CSS **v4** (CSS `@theme`, no JS config); **hand-rolled Radix + cva primitives** in `src/components/ui/` (NOT shadcn/ui — full control of the glass aesthetic) | Avoids generic shadcn defaults |
| Theming | `next-themes`, HSL semantic tokens only (no raw hex) | PRD §7.4 light/dark, WCAG AA |
| PWA | Serwist (`@serwist/next`) | Maintained App-Router service worker + manifest |
| Data fetching | TanStack Query over a `DataProvider` interface | Lets us swap mock → Neon with no UI changes |
| Local UI state | Zustand (theme, privacy mask, dashboard layout) | Light, no boilerplate |
| Drag reorder | `@dnd-kit` (`SortableWidget`) | PRD §6.1 dashboard |
| Charts | Recharts, lazy-loaded chunk | PRD perf budget: charts excluded from initial 200KB |
| i18n/format | `Intl.NumberFormat('sv-SE')` → `12 450 kr`; English chrome | PRD §3.4 |
| Tests | Vitest + React Testing Library | PRD §8 regression tests (`SafeToSpendWidget.test.tsx`) |
| DB (later) | Neon Postgres + Drizzle ORM (`@neondatabase/serverless`) | Serverless-friendly on Vercel |
| Auth (later) | Auth.js Google provider | User choice, deferred |
| LLM (later) | OpenAI API via route handler | Categorization + confidence + training set |

## Architecture: the data contract

A single TypeScript module defines the domain types (PRD §5) and pure helpers:
- `lib/domain/types.ts` — `Transaction`, `Account`, `Category`, `Tag`, `Budget`, `Goal`.
- `lib/domain/effectiveExpense.ts` — `effectiveExpense(tx, account)` + `isCountedSpending`.
  This is the ONLY place spending math lives; everything imports from here.
- `lib/data/DataProvider.ts` — interface (`getTransactions`, `addTransactions`,
  `updateTransaction`, budgets/goals/categories/tags/accounts CRUD).
- `lib/data/MockDataProvider.ts` — realistic Swedish mock data (incl. SEB sample,
  Revolut + savings accounts, a salary income tx). Backed by localStorage for persistence.
- Later: `lib/data/NeonDataProvider.ts` implements the same interface server-side.

All aggregations (widgets, month nets, budget status) consume `DataProvider` results and
run them through `effectiveExpense`. The collapsed-month net (PRD §6.2) is the canonical
example and gets a unit test.

## Phased roadmap

### Phase 0 — Scaffold (no screenshots needed)
- `create-next-app` (TS, App Router, Tailwind) into `saldo/`; init git.
- Add shadcn/ui, `next-themes`, Zustand, TanStack Query provider, `@dnd-kit`, Recharts,
  Vitest + RTL config.
- Serwist: `app/manifest.ts`, service worker, icons → installable PWA shell.
- HSL semantic token theme ("Silver Slate" greys, frosted glass surfaces), light/dark.
- **Verify:** `npm run dev` serves; `npm test` runs; Lighthouse shows installable PWA.

### Phase 1 — Domain + mock data (no screenshots needed)
- Implement `lib/domain/*` and `lib/data/*` as above with full Swedish mock dataset.
- `lib/format.ts` (SEK/sv-SE, privacy-mask `•••• kr`).
- **Verify:** unit tests for `effectiveExpense` (ignored / income / savings / split /
  Revolut-transfer cases) and month-net all pass.

### Phase 2 — App shell & IA (screenshots helpful)
- Routes per PRD §4: `/`, `/transactions`, `/budgets`, `/goals`, `/categories`,
  `/accounts`, `/tags`, `/settings`, stub `/login` `/register`.
- Slim sidebar on `lg+`, bottom tab bar + "More" menu on mobile, Quick Add FAB on every
  authed route, global privacy-mask toggle.
- **Verify:** all routes navigable on mobile + desktop breakpoints; 44×44 hit targets.

### Phase 3 — Feature screens (screenshots needed per screen)
Build against mock data, each with default/hover/selected/excluded/masked states:
- **Home dashboard** — sortable widgets (Safe to Spend w/ size variants + regression test,
  Month spend by category, Trend, Budgets status, Goals progress, Recent activity, Calendar
  heatmap, **Relative highest budget**). Each new widget ships a `size="small"` test (PRD §8).
- **Activity** — month-grouped infinite list, filters, excluded-row treatment (dimmed,
  strike-through, "Excluded" pill + `EyeOff`), virtualize >200 rows.
- **Transaction Detail** — editable category (confidence dot + predicted hint + "corrected"
  indicator), tags (inline-create), split, exclude switch, notes.
- **Budgets** — per-category (top or sub), spend-vs-cap, **health** signal, safe-to-spend
  banner, clone-last-month CTA, overspend **alerts**, **forecast**.
- **Goals** — rings, contribution log, on-track verdict, linked savings account.
- **Categories / Tags / Accounts** — CRUD w/ emoji+color, nesting, detach-on-delete.
- **Import** — Swedish CSV/XLSX, column mapping, preview/summary/dedupe, confirm → append;
  mock auto-categorization sets confidence + `needsReview`.
- **Settings** — theme, privacy mask, locale (fixed sv-SE/SEK), data reset/export.

### Phase 4 — Backend wiring (after UI is solid)
- Neon + Drizzle schema mirroring the domain; `NeonDataProvider` server-side; **preserve
  `effectiveExpense` in SQL/queries** (PRD §9.1).
- OpenAI route handler for categorization (confidence stored, low → `needsReview`);
  **training set** table appended from correct + corrected categories.
- Auth.js Google provider; budget **alerts** via PWA push (Web Push).
- Deploy to Vercel (Neon env vars, OpenAI key).

## Verification (end-to-end)
- `npm run dev` → app loads on mobile + desktop layouts; installable as PWA.
- `npm test` → `effectiveExpense`, month-net, and every widget `size="small"` test pass.
- Manual: import the SEB sample, exclude a tx and confirm it stays visible but drops from
  month net + dashboard; toggle privacy mask hides all amounts; transfer to Revolut/savings
  is not counted as spend; salary counts once as income.
- Later: Lighthouse PWA + perf budget (<200KB initial JS gz excl. charts); Vercel preview
  deploy against Neon works.

## Design polish pass (current)

Dashboard is built and running. This pass raises design quality before moving to the
remaining screens. Chosen with the user (light-theme polish explicitly deferred):

0. **Widget-size uniformity (in progress).** Same-size widgets must match across rows.
   - `dashboard/sortable-widget.tsx`: apply `SIZE_MIN_H[size]` + `h-full` to the root and
     `h-full` to the inner content wrapper.
   - Add `h-full` to standalone widget Cards: `safe-to-spend-widget.tsx`, `trend-widget.tsx`,
     `calendar-heatmap.tsx`, `recent-activity.tsx`.

1. **Category donut chart.** Restore the screenshot's donut for "Spending by category".
   - New `dashboard/category-donut.tsx` ('use client'): Recharts `PieChart`/`Pie` (donut),
     one `Cell` per category tinted `hsl(category.color)`, center label = total `formatSEK`.
   - Lazy-load via `next/dynamic` (`ssr:false`) with a skeleton so Recharts stays in its own
     chunk (PRD perf budget §7.5). Wire into the registry `category` widget; at `size="small"`
     degrade to the existing compact bar list. Reuse `spendByRootCategory` (already computed).

2. **Motion & micro-interactions** (CSS-only, no new dep; gated by `prefers-reduced-motion`).
   - `globals.css`: `@keyframes rise` + `.animate-rise`; subtle `.glass` hover-lift.
   - `ring.tsx` + `progress.tsx`: become client; animate from 0 → target on mount.
   - `page.tsx`: staggered `animationDelay` per grid item, disabled while `editing`.
   - Nav buttons + FAB: `active:scale` press feedback (FAB already has it).

3. **Atmosphere & glass depth.**
   - `globals.css`: fixed, pointer-events-none SVG fractal-noise grain overlay at low opacity;
     refine `.glass` shadow + inset highlight.
   - `src/data/mock.ts`: harmonize category `color` HSLs into a cohesive, well-spread palette
     (current ambers/greens clash).

### Verification
- `npm run build` clean (TS + Turbopack); `npm test` still 14/14.
- Dev: donut renders and loads as a separate chunk; widgets stagger in once; rings/bars
  animate from zero; cards lift on hover; grain texture subtly visible; same-size widgets
  align across rows. With OS reduce-motion on, no animation (global rule forces ~0ms).

## Status — dashboard complete & visually verified (2026-05-26)

Done and verified (build clean, 64 tests passing, Playwright screenshots reviewed):
- Editable dashboard: drag-reorder + per-widget S/M/L. **Size now maps to width** on a
  1/2/4-col grid (small ¼, medium ½, large full) — S and M are visibly distinct.
- Widgets adapt at narrow width (single-column rings, compact category list, truncation,
  `overflow-hidden` cards) — **no content overflow**.
- Widgets: Total spending, Daily pace, Category donut (Recharts, lazy chunk), Trend,
  Budgets, Goals, Daily-spend heatmap, Recent activity, Total capital, Spend by account.
- Motion (staggered entrance, rings/bars animate from 0, hover-lift), grain + glass depth,
  harmonized category palette, Bricolage/Hanken typography.
- Tests: every widget rendered at every size + size→width mapping + domain contract.

## Liveliness pass — iOS 26 "Liquid Glass" (current)

Make the app feel alive: tactile glass + springy physics. Chosen with user
(number-rolls and page/theme transitions deferred). Respects `prefers-reduced-motion`
globally via `<MotionConfig reducedMotion="user">`.

**A. Interactive glass (CSS-only, no dep).**
- ~~Cursor-tracked specular sheen on cards~~ — **removed at user's request (disliked it).**
  `ui/card.tsx` reverted to a plain (server) component; the `.glass-sheen` CSS was deleted.
- Kept: card **hover-lift** (`hover:-translate-y-0.5`) and a spring press easing token
  `cubic-bezier(0.34,1.56,0.64,1)`.
- Tactile press (`active:scale-[0.96]` + spring easing) on `ui/button.tsx`, bottom-nav items,
  FAB, and list rows (`recent-activity.tsx`, future tx rows) get hover bg.

**B. Springy motion system (add `motion` / framer-motion).**
- `components/providers.tsx` → wrap in `<MotionConfig reducedMotion="user">`.
- `nav/bottom-nav.tsx` → active pill is a `motion.div` with shared `layoutId="navPill"`, so the
  blue highlight slides/morphs between tabs (spring).
- `ui/dialog.tsx` → `motion` spring enter for the dialog/sheet (slide-up + scale, rubber-band);
  exit via `AnimatePresence` + Radix `forceMount`; backdrop fades.
- `dashboard/sortable-widget.tsx` → entrance becomes a `motion.div` on the **inner** wrapper
  (spring + staggered delay) so it does not fight dnd-kit's transform on the outer node; tune the
  dnd reflow `transition` to a springier curve. (Root keeps `data-testid/data-size/min-h` — tests
  unaffected.)

### Verification (liveliness)
- `npm run build` clean; `npm test` still green (tests assert root classes/text, not motion).
- Playwright: nav pill slides between tabs; Quick-Add sheet springs up; cards lift on hover
  (no cursor sheen). With OS reduce-motion, no animation. (Verified 2026-05-26.)

## YAGNI/KISS cleanup (2026-05-26)

Removed dead/speculative code; ESLint now clean (0 problems), 63 tests pass, build clean.
- Deleted dead `.animate-rise`/`@keyframes rise` (replaced by Motion).
- Consolidated the duplicate `WidgetSize` type into `store/ui.ts`.
- Dropped unused `shareOfMonth` (+ its extra `monthSpend` pass) from `budgetStatuses`.
- Removed `isCountedSpending` (only its own test used it).
- Reverted `Ring`/`ProgressBar` to pure components (the animate-from-zero hack tripped
  `react-hooks/set-state-in-effect`); CSS transition still animates on value changes.
- Extracted one `useMounted` hook (`useSyncExternalStore`) for `ThemeToggle` +
  `HydrationGate`, removing duplicated setState-in-effect mount guards.
- Kept (next panels need them, not YAGNI): store CRUD, `Switch`, `Textarea`, `Tooltip`
  primitives, `includedNet`, `CategoryChip.confidence`.

## Transactions screen — done (2026-05-26)

`/transactions`: search + filters (category/account/tag/needs-review/has-splits), month nav
with count + **Net** (tooltip, via `monthNet`/`includedNet`), colored category chips with
confidence dots, income green, excluded rows dimmed/struck + "Excluded" pill. Master-detail:
desktop sticky side panel, mobile springy sheet (`useMediaQuery`). Editable detail
(`transaction-detail.tsx`): category Select (confidence % / "Corrected" / AI-predicted hint),
`TagEditor` (add/remove/inline-create), `SplitEditor` (equal/manual, "you pay" mine total),
exclude Switch, notes — all via `updateTransaction`. New: `ui/popover.tsx`,
`lib/use-media-query.ts`, shared `nextMonthKey`. Tests: row, split-editor, detail (75 total).

## Native-feel pass — done (2026-05-26)

Built & verified: `.pressable` utility applied across rows/pills/selects/icon-buttons/links/
tag-add/quick-add toggles (shared `ui/icon-button.ts` extracted); Transactions desktop detail
panel wrapped in `AnimatePresence` (spring fade+slide on select, cross-fade on switch).
Lint clean, 75 tests pass, build clean, panel verified via screenshot.

Goal: make the app feel like a native mobile app even on desktop — every tap is physical,
and the Transactions detail panel animates in. Decided with user: **press feedback
everywhere**, **Medium intensity** (~3% press scale, ~200ms springs), **no route/screen
transitions** (kept instant). Respects `prefers-reduced-motion` (already global + explicit guard).

**1. Universal press feedback — one `.pressable` utility (DRY).**
- `globals.css` → `@layer components` add:
  `.pressable { transition: transform .18s cubic-bezier(.34,1.56,.64,1) } .pressable:active { transform: scale(.97) }`
  plus a `@media (prefers-reduced-motion: reduce)` override that nulls the transform.
- Apply `.pressable` to the shared interactive primitives + tappable rows (representative files):
  `ui/select.tsx` (SelectTrigger), `transactions/transaction-row.tsx`, `nav/theme-toggle.tsx`
  + `nav/privacy-toggle.tsx` (the shared `ICON_BTN` string — extract to one constant while
  here), month-nav arrows in `dashboard/controls.tsx` + `transactions/page.tsx`, the
  `TogglePill`/`PillSelect` in `transactions/page.tsx`, `dashboard/registry.tsx` `AllLink`,
  `transactions/tag-editor.tsx` (Add button + chip remove), `dashboard/recent-activity.tsx`
  rows. `ui/button.tsx`, bottom-nav items, and the FAB already press — leave as-is (or
  reconcile to the same easing).

**2. Detail-panel transition (Transactions, desktop side panel).**
- `app/(app)/transactions/page.tsx` → wrap the side-panel content in `AnimatePresence mode="wait"`
  with a `motion.div` keyed by `selectedId ?? "empty"`; enter = fade + slide-up (~10px) + spring,
  so selecting animates in and switching transactions cross-fades. Card container stays static.
- Mobile bottom sheet already springs (`ui/dialog.tsx`) — no change.

### Verification (native-feel)
- `npm run build` clean; `npm test` green (press is CSS; AnimatePresence wraps but
  `TransactionDetail` still renders — detail/row tests unaffected).
- Playwright: select a row → detail still renders (panel animates in); pressing the FAB/rows
  shows the scale (visual). With OS reduce-motion, no transform/animation.

## Budgets + Goals screens — done (2026-05-26)

Both master-detail (desktop sticky panel + mobile sheet, `useMediaQuery`, `.pressable` rows,
`AnimatePresence` panel). **Budgets** (`/budgets`): month nav + overall spent/limit bar,
health-colored rows (sub-cats show parent ↳), `BudgetEditor` (category, monthly limit, repeat
toggle → `month` null/key, delete) via `upsertBudget`/`removeBudget`. **Goals** (`/goals`):
overall saved/target bar, rows with deadline status (overdue/left), `GoalEditor` (emoji+name,
target/already-saved, linked savings account, contribution log add/remove, deadline) via
`upsertGoal`/`removeGoal`. Tests: selectors (`budgetStatuses` health, `goalProgress`,
`monthNet`) + both editors. 87 tests total, lint clean, build clean, screenshots verified.
Note: omitted the screenshot's "Apply to this/future months" segmented control — our Budget
model is single `month|null` with no per-month overrides (KISS); the repeat toggle covers it.

## Categories screen — done (2026-05-26)

`/categories`: parent cards (emoji badge, name, subcategory count, pencil) with colored
subcategory chips + dashed "Add subcategory"; "New category" for top-level. `CategoryEditor`
(name+emoji, color swatch picker, parent hint, delete) via `upsertCategory`/`removeCategory`
(delete detaches tx). Master-detail + `.pressable` + `AnimatePresence`. Editor test added; 90 total.

## Emoji picker (Categories) — done (2026-05-26)

Reusable `ui/emoji-picker.tsx` (glass Popover, ~60 curated emojis, no dep) wired into
`CategoryEditor`. Test added (trigger shows value; pick calls onChange). 92 tests, lint/build
clean, screenshot verified. Reusable for Goals/Accounts/Tags later.

Chosen: **curated grid, no dependency** (matches the lean-deps ethos).

- New `src/components/ui/emoji-picker.tsx`: reusable `EmojiPicker({ value, onChange })` — a
  glass `Popover` (reuse `ui/popover.tsx`) whose trigger is a `pressable` button showing the
  current emoji; content is a grid of ~50 curated finance/life emojis; clicking sets value +
  closes. No new dep.
- `components/categories/category-editor.tsx`: replace the emoji `Input` with `<EmojiPicker>`.
  (Reusable later for Goals/Accounts/Tags — not changing those now, step by step.)
- Test `ui/emoji-picker.test.tsx`: trigger shows current emoji; opening + selecting calls
  `onChange`.

### Verification
- `npm run build` clean; `npm test` green (existing category-editor test unaffected — it
  queries the name field, not the emoji input). Playwright: open Categories editor, open the
  picker, see the grid.

## Accounts + Tags screens — done (2026-05-26)

Both master-detail (desktop panel + mobile sheet, `.pressable`, snappy `spring`). Extracted
reusable `ui/color-swatches.tsx` (`ColorSwatches` + `COLOR_SWATCHES`) and refactored
`CategoryEditor` to use it (DRY). **Accounts** (`/accounts`): rows with icon badge, Savings
badge, "type · N transactions"; `AccountEditor` (emoji, name, type, Spending/Savings kind +
hint, color, archive toggle, delete disabled while in-use → "archive instead") via
`upsertAccount`/`removeAccount`. **Tags** (`/tags`): color-dot rows + "N txs"; `TagEditor`
(name, color, delete-detaches) via `upsertTag`/`removeTag`. Editor tests added; 96 total,
lint/build clean, screenshots verified.

## Settings screen — done (2026-05-26)

Built & verified: Appearance (Light/Dark/System segmented), Privacy (mask switch), Data
(Clear all data → confirm Dialog → new `clearData()` store action), Locale & about (read-only
sv-SE/SEK, PWA hint, version). Added `window.matchMedia` polyfill to `vitest.setup.ts`
(jsdom lacks it; next-themes system mode + `useMediaQuery` need it). 100 tests, lint/build
clean, screenshot verified.

A single scrollable column of grouped glass cards (settings-list style, not master-detail).
Scoped with user: four sections, **only "Clear all data"** for data actions, **future
features hidden** (no alerts/AI/auth). `src/app/(app)/settings/page.tsx` + one store action.

1. **Appearance** — theme **Light / Dark / System** segmented control (`next-themes`
   `useTheme().setTheme`; `useMounted` to mark the active one without hydration mismatch).
2. **Privacy** — "Mask amounts" `Switch` bound to `useUI` `masked`/`toggleMask` (mirrors the
   header eye toggle).
3. **Data** — destructive "Clear all data" button → confirm `Dialog` → new store
   `clearData()` (sets every entity array to `[]`, persists). Note: no Reset-to-demo per user,
   so clearing leaves an empty app (no in-app path back to the seed).
4. **Locale & About** — sv-SE / SEK shown read-only (PRD-fixed); app version; "Install as app"
   (PWA) hint.

Reuse: `Card`, `Switch`, `Button`, `Dialog`, `useMounted`, `useUI`, `useData`. Small inline
`SettingRow` (label + description + control). Add `clearData` to `src/store/data.ts`.

### Verification
- `npm run build` + `npm test` clean. New tests: store `clearData` empties all arrays;
  settings page renders the four sections (wrap in `next-themes` ThemeProvider).
- Manual: switch theme (persists, header reflects); toggle mask (header eye reflects);
  Clear all data → confirm → dashboard/lists show empty states.

## Import flow — done (2026-05-26)

Built & verified. More → Import opens a global 2-step modal (`importOpen` in `useUI`, modal
mounted in `(app)/layout.tsx`; `/import` route removed; More-menu Import is now a button).
Step 1: choose CSV / "Use sample" → editable auto-detected mapping + "Import into" account.
Step 2: live summary grid + editable rows (date/description/amount/category+confidence),
duplicates (date+amount+description in target account) auto-deselected/struck → "Import N rows"
→ `addTransactions` (categorySource model, needsReview) → /transactions. New: `lib/parse-csv.ts`,
`lib/categorize.ts`, `components/import/import-modal.tsx`, `public/mock-imports/seb-april-2025.csv`.
`useUI` got `partialize` (importOpen never persists). Screenshot showed 42/44 import, 2 dups,
9 review — dedup against seed works. **All UI-first screens now complete; 107 tests, lint/build
clean.** Deviation: omitted the Tags column in import rows (table width; add later in Activity).

Global modal launched from **More → Import** (like Quick Add). Two steps; **CSV-only** (no
dep); **account picker**; **auto-detected + editable** column mapping; **all review fields
editable**; duplicate = **date+amount+description** in target account; **realistic sample,
live stats**.

**Wiring / state**
- `store/ui.ts`: add transient `importOpen` + `setImportOpen`; add `partialize` so persistence
  keeps only `{ masked, month, accountFilter, layout }` (importOpen never persists).
- `app/(app)/layout.tsx`: mount `<ImportModal/>` (alongside the FAB).
- `nav/bottom-nav.tsx` + `nav/nav-items.ts`: the "Import" More-menu entry becomes a **button**
  → `setImportOpen(true)` (Tags/Settings stay links); remove `/import` from `moreNav` and
  **delete `app/(app)/import/page.tsx`**.
- Widen the dialog for the table: pass `className="sm:max-w-3xl"` to `DialogContent` (it
  merges className; mobile stays a full-width bottom sheet, table scrolls horizontally).

**New files**
- `lib/parse-csv.ts`: detect delimiter (`,`/`;`), parse quoted fields, **auto-detect** the
  date/description/amount columns from headers (datum/date · text/beskrivning/description ·
  belopp/amount), Swedish number parse (`−12 500,00` → `-12500`), normalize date → `YYYY-MM-DD`.
- `lib/categorize.ts`: mock keyword model → `{ categoryId, confidence }` (ICA/Hemköp/Coop/
  Willys/Lidl→Groceries; Spotify/Netflix/HBO/Disney+/iCloud→Subscriptions; SL/Månadskort→
  Public Transit; Hyra→Rent; Vattenfall/Elräkning→Electricity; Klarna/H&M/Zalando→Clothing;
  Apotek→Health; OKQ8/Bensin→Fuel; Restaurang/Max/Café/Espresso/Pelikan→Restaurants; Uber→
  Transport; fallback Other ≈0.4). `needsReview = confidence < 0.6`.
- `components/import/import-modal.tsx`: **Step 1** — file upload OR "Use sample"
  (`fetch('/mock-imports/seb-april-2025.csv')`), editable detected-mapping `Select`s, "Import
  into" account `Select`, Continue. **Step 2** — summary grid (will-import/dups/date-range/
  needs-review/money in·out·net/account-rows, live) + editable review table (include checkbox,
  date, description, amount inputs; category `Select`+confidence dot/%; reuse `TagEditor`);
  duplicates auto-deselected + struck + "Duplicate of existing"; Back / **Import N rows** →
  `addTransactions` (`categorySource:"model"`, `predictedCategoryId=categoryId`, `needsReview`),
  then close + navigate `/transactions`.
- `public/mock-imports/seb-april-2025.csv`: realistic SEB-style April-2025 export (~50 rows,
  `;`-delimited, decimal comma, headers e.g. `Bokföringsdatum;Belopp;Text`); a few rows mirror
  seed dates/amounts to demo duplicate-skip.

**Reuse**: `CategoryChip`, `Select`, `TagEditor` (`components/transactions/tag-editor.tsx`),
`formatSEK`, `Dialog`, `useData` (accounts/categories/transactions/`addTransactions`), domain types.

### Verification
- `npm run build` + `npm test` clean. New unit tests: `parse-csv` (delimiter/amount/date/
  auto-detect) and `categorize` (keywords → category+confidence; fallback → needsReview).
- Playwright: More → Import → Use sample → Continue → review shows summary + struck duplicate
  rows; edit a row; **Import N rows** appends to the chosen account and lands on /transactions.

## Nav redesign — done (2026-05-26)

iOS-style bottom nav reworked: **4 roomy primary tabs** (Home/Activity/Budgets/Goals);
Categories + Accounts moved under **More** (`nav-items.ts`). Active tab = **wide rounded
rectangle** (icon + label), inactive = icon-only; label width animates via **pure CSS**
(`max-width`/opacity transition). Detached **"+" circle** beside the pill opens Quick Add
(`QuickAddModal` is now store-controlled via `useUI.quickAddOpen`; old floating `QuickAddFab`
deleted). Active-end pill hugs the container corner.

**Jank fix (important):** Framer `layout`/`layoutId` on nav elements mis-measured viewport
boxes across route changes and made the bar visibly **pop up ~20–420px** then settle. Removed
ALL Framer layout animation from the nav (container `layout`, per-tab `layout`, and the
`layoutId="navPill"` slide). Active highlight is now a static `bg-primary` span; the only
animation is the CSS label expand. Verified with a Playwright probe: max nav element
translateY during navigation = **0.0px** (was 420). Trade-off accepted: the pill no longer
slides between tabs.

## Settings → customizable nav bar — PLANNED (not built)

User wants to **restructure the bottom nav from Settings** — choose which destinations are
primary tabs vs. under "More" (and ideally their order). Approach when built:
- `store/ui.ts`: persist a `navOrder`/`navPrimary` (list of route keys + which are primary,
  cap primary at ~4). Add to `partialize`.
- `nav-items.ts`: keep a master registry of all destinations; `bottom-nav.tsx` derives
  primary vs. More from the store instead of hard-coded `primaryNav`/`moreNav`.
- Settings: new "Navigation" section — reorder + toggle primary (dnd-kit reuse, or simple
  up/down + a "primary" switch with a max-4 guard). Mirror the dashboard layout-edit pattern.
- Tests: store reducer (set primary, cap, reorder); Settings section renders.

## Dashboard polish batch — current (in progress / planned)

Several small dashboard improvements. Some already landed on disk before re-entering plan
mode (noted DONE); the rest are to implement on approval.

1. **Trend per-category — DONE.** `categoryTrends()` selector (Total + top-6 categories);
   `TrendWidget` now takes `series`, renders glass chips (Total + category, colored), switches
   the line/value on click. `spendTrend` removed (unused). Tests updated (108 pass).
2. **Snappier motion — DONE.** Shared `spring` → stiffness 920 / damping 42 (drives panels,
   sheets, entrances); nav label expand 200ms; `.pressable` 110ms.
3. **Trend graph animation — TODO.** When switching series, morph the SVG line/area with
   `motion.path` animating `d` + `stroke` (all series share 6 points → interpolates); end-dot
   `motion.circle` animates cx/cy; transition `spring`. iOS-glass feel, snappy.
4. **"Back to current month" button — TODO.** `latestDataMonth(transactions)` selector DONE.
   New shared `components/month-switcher.tsx` (prev/label/next pill + an animated "This month"
   button that appears via `AnimatePresence` only when `month !== latestDataMonth`; opacity+x,
   no width animation). Replace the inline month pills in `dashboard/controls.tsx`,
   `transactions/page.tsx`, `budgets/page.tsx` with it (DRY). Suffix prop for the "· N" count.
5. **Redesign hero "This month" widget — TODO.** Replace the sparse centered Total-spending
   card (`registry.tsx` `total` entry — keep the id "total" to avoid layout-key migration).
   New = **hero + stat row**, left-aligned, vertically centered:
   - Headline: big `font-display` **Spent** (−X kr) + vs-last-month arrow/percent chip.
   - Stat row (glass-inset chips): **Left to spend** (budgetLimitTotal − spent) and
     **Safe to spend/day** (remaining ÷ days left; for non-current months show avg/day instead).
     Graceful no-budget fallback (avg/day + days-in-month).
   - Retitle label to "This month". Update its registry title.
6. **Clearer default dashboard — TODO.** Recurate `defaultLayout` in `store/ui.ts` for a
   focused first screen (hero large; then budgets, category donut, trend, recent, goals; then
   pace, calendar, capital, byaccount). Keep ALL widgets present (no hide concept yet — true
   show/hide ties into the planned customizable layout). Note: existing persisted layouts keep
   their order; "Edit layout → Reset" applies the new default (non-destructive; no version bump).

### Verification
- `npm run build` + `npm test` clean (update/extend widget tests: hero renders Spent + Left
  to spend; trend chip switch already covered; month-switcher shows the button only off-current).
- Playwright: dashboard opens focused; hero shows headline + 2 stats, vertically centered;
  switch trend series → line morphs; navigate a month → "This month" button appears, returns.

## Open items / next
- **Settings → customizable nav bar** (planned above) — next candidate.
- Light-theme ("Silver Slate") polish — deferred.
- Backend (Phase 4): Neon + Drizzle, OpenAI categorization + training set, Google auth.

## Idea: user-defined categorization rules page (2026-05-30, not finalized)
Captured for later — user will refine when they pick it up.

**Problem.** LLM categorization struggles when the bank description is poor/cryptic,
and some merchants are *always* the same category — paying the LLM to re-guess them
every import is wasteful and occasionally wrong.

**Idea.** A new **Rules** page where the user creates/customizes their own
categorization rules. A matched transaction is classified deterministically and
**skipped by LLM inference** (saves cost + guarantees consistency).

**Rough shape (to refine):**
- A rule = match condition → outcome. Match likely on description (contains / starts-with
  / regex?), possibly also amount sign/range or account. Outcome sets `kind` and/or
  `categoryId` (+ confidence 1).
- Stored per-user in the DB (new `categorization_rules` table); editable in a Rules page
  (list, add, edit, delete, reorder for precedence).
- Runs in the categorize pipeline **before** the OpenAI call — generalizes today's
  hardcoded `classifyRules` (REVOLUT/SEB KORT/AVANZA/LÖN/LÅN) and `matchesOwnAccount`
  (own account numbers) into user-managed data. Those built-ins could seed the first rules.
- Open questions: precedence/ordering, regex vs simple contains, whether rules also
  retro-apply to existing transactions (like the savings-number backfill), and how this
  interacts with the training-set feedback loop.
