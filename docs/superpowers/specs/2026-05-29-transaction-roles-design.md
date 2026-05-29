# Transaction roles, transaction-driven goals, hidden income — design

- **Date:** 2026-05-29
- **Project:** pegels (Next.js + Neon/Drizzle personal-finance PWA)
- **Status:** Approved (brainstorm), ready for implementation plan

## Context

Today the app classifies money implicitly: a transaction counts as an expense via
`effectiveExpense` (negative, not `ignored`, not on a `savings` account), income is any
positive amount, and "don't count this" is the single `ignored` flag. Goals track progress
through a **separate, manually-typed** `contributions[]` log unrelated to transactions.

This causes three problems the user hit:

1. **No real transfer concept.** Money moved between the user's own accounts is two-legged
   in their data (e.g. SEB `−5000` *and* Revolut `+5000`). Unless both legs are manually
   `ignored`, the outflow counts as an expense and the inflow as income → **double-counted**.
   The savings-account inflow leg also currently leaks into the **income** total (a real bug).
2. **Savings aren't transaction-driven.** Transferring to a savings account toward a goal is a
   real transaction, but there's no way to mark it as "savings → goal X" and have it advance
   the goal. Goal progress is a disconnected manual log.
3. **Income is always visible.** The user wants to demo the app without exposing salary. The
   amount-mask (`••••`) is not enough. *All* external inflows (salary, friend paybacks,
   refunds) are uninteresting and should be hidden and never counted — shared-cost
   correctness already comes from **splitting** the original expense, not from the repayment.

## Goals

- One explicit classification per transaction: **expense / income / transfer**.
- Internal transfers count as **neither** expense nor income (no double-counting), with
  **auto-detection** of two-legged transfer pairs at import.
- **Savings = a transfer earmarked to a goal**; goals are **transaction-driven**
  (`saved = baseline + Σ linked transfers`).
- **Income is never displayed** (no rows in the Activity list, no summary metrics) and never
  counts toward anything.

## Non-goals (YAGNI)

- No "link this payback to refund that specific expense" feature — paybacks are just ignored
  income; correctness comes from splitting the original expense.
- No arbitrary one-off "exclude this transaction" flag separate from `transfer` (the `ignored`
  flag is removed).
- Hiding **capital / account balances** is out of scope — only the salary/income *flow* is
  hidden; net-worth balances stay visible.
- A toggle to reveal income is out of scope (income stays hidden).

## Decisions

| Topic | Decision |
|---|---|
| Classification | Explicit `kind: "expense" \| "income" \| "transfer"` on each transaction |
| Savings → goal | A `transfer` with `goalId` set; goals derived from linked transfers |
| `Goal.contributions[]` | Removed (derived from transactions) |
| Income | All external inflows; hidden from UI and excluded from all math |
| Transfer detection | Auto-pair `−X`/`+X` across two own accounts within ~3 days at import; overridable |
| `ignored` flag | Removed — "counted nowhere" is now `kind === "transfer"` |
| Capital/balances | Stay visible |
| "Net" displays | Replaced with "Spent" |

## Data model

### `Transaction` (`src/lib/domain/types.ts`)
- **add** `kind: TransactionKind` where `type TransactionKind = "expense" | "income" | "transfer"`.
- **add** `goalId: string | null` — meaningful only when `kind === "transfer"`; the goal this
  transfer funds.
- **remove** `ignored: boolean`.

Default `kind` on creation/import is derived from amount sign: `amount < 0` → `expense`,
`amount >= 0` → `income`. The user overrides to `transfer` (optionally with a goal) in the
detail panel; import auto-detection may set `transfer` on both legs of a matched pair.

### `Goal` (`src/lib/domain/types.ts`)
- **remove** `contributions: GoalContribution[]` and the `GoalContribution` type.
- **keep** `baseline` (saved before/outside the app), `accountId` (linked savings account —
  also used to auto-suggest the goal when marking a transfer into it), `target`, `deadline`,
  `name`, `icon`.

### Drizzle schema (`src/lib/db/schema.ts`) + migration
- `transactions`: **+`kind` (text, not null), +`goal_id` (text, null), −`ignored`**.
- `goals`: **−`contributions` (jsonb)**.
- Apply with `npm run db:push`, then re-seed (`npm run db:seed`).
- Update `map.ts`, `queries.ts`, server actions, and the `useData` optimistic reducers for the
  new/removed fields.

## Core logic (`src/lib/domain/`)

- **`effectiveExpense(tx, account)`** becomes kind-driven:
  `kind === "expense" && amount < 0` → split-aware `Σ |mine|` else `|amount|`; otherwise `0`.
  This replaces the old `ignored` and `account.kind === "savings"` checks with one rule.
- **`goalSaved(goal, transactions) = baseline + Σ |amount|`** over `tx.goalId === goal.id`
  (kind `transfer`). `goalProgress` consumes this (now takes `transactions`).
- **Income** = `kind === "income"`: never rendered, never counted.
- Net-style figures that mixed income and expense are replaced by **`monthSpend`** ("Spent").
  Remove now-unused income/net selectors and displays.

## Auto-detect transfers (import — `src/components/import/import-modal.tsx` + a selector/util)

On import, pair an outflow `−X` with an inflow `+X` across **two different own accounts**
within **~3 days** → set **both legs** `kind: "transfer"`. If the destination is a savings
account that is a goal's `accountId`, set that `goalId` on the **outflow** leg. Misfires are
overridable via the detail-panel Type control. Matching is by absolute amount + account
pairing + date window; document the heuristic and that unmatched inflows stay `income`.

## UI changes

- **Transaction detail panel** (`transaction-detail.tsx`): replace the "Exclude from totals"
  switch with a **Type** control (Expense / Income / Transfer). When **Transfer**, show an
  optional **"Counts toward goal"** picker (sets `goalId`; pre-selected when the account is a
  goal's linked savings account). Category is relevant only for expenses.
- **Activity list** (`/transactions`): **filter out `kind === "income"`** rows (and from
  filters). Show transfer rows with a distinct "Transfer" / "→ \<goal\>" treatment (not the
  income-green / expense styling). Replace the month **"Net"** with **"Spent"**.
- **Dashboard**: remove the **"Income"** stat (registry `total` no-budget fallback shows pace
  info instead). Capital widget unchanged. Savings-goals widget reflects transaction-driven
  saved amounts.
- **Goals page/editor** (`goal-editor.tsx`, `/goals`): drop the manual "add contribution" UI;
  keep name/emoji/target/baseline/linked-account/deadline. Goal detail lists its **linked
  transfer transactions** and shows `saved = baseline + their sum`.

## Seed (`src/data/mock.ts`)

- Set `kind` on every seed transaction: salary → `income`; the Sparkonto/Revolut transfer
  rows → `transfer`; the rest → `expense`. Remove `ignored`.
- **Convert the seed goals' `contributions` into real transfer transactions** (kind=`transfer`,
  `goalId` set, dated, into the goal's linked savings account) so goal totals carry over and
  the feature is demoable. Remove `contributions` arrays.

## Testing

- Update `effectiveExpense` tests to be kind-based (expense counts; income/transfer = 0; split
  "mine" preserved).
- New `goalSaved`/`goalProgress` tests (baseline + linked transfers; ignores non-linked).
- New transfer auto-pairing tests (matched pair → both `transfer`; goal link on outflow when
  destination is a goal account; unmatched inflow stays `income`; no false pairs).
- Activity list excludes income rows; dashboard has no income stat; "Spent" shown not "Net".
- Detail-panel Type control (switch to Transfer reveals goal picker, sets `goalId`).
- Goal-editor test updated (no manual contributions).
- Keep the existing Query-facade/test harness; update `mock.ts`-derived expectations.

## Implementation phasing (one plan, three stages)

1. **`kind` model + transfers** — types, schema/migration, `effectiveExpense`, detail-panel
   Type control, import auto-detect, seed, fix the income-leak. (Foundation.)
2. **Transaction-driven goals** — remove `contributions`, `goalSaved`/`goalProgress`, goal
   editor + detail, savings→goal link in the detail panel.
3. **Hide income** — Activity list filtering, dashboard income-stat removal, Net→Spent.

## Verification

`npm test` green (updated + new suites); `npm run build` + `npm run lint` clean;
`npm run db:push` + `npm run db:seed` apply the schema and reseed; manual check against Neon:
mark a transfer (no double-count), mark a savings→goal transfer (goal advances), confirm no
income row or income figure appears anywhere, and auto-detect pairs an imported `−X`/`+X`.
