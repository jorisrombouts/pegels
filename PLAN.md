# Pegels — architecture & roadmap

> **Pegels** is a single-user Swedish personal-finance PWA: import your bank transactions,
> auto-categorize them with an LLM that learns from your corrections, and see calm spending
> analysis (budgets, goals, trends). Built with Next.js 16 (App Router) + Neon Postgres + OpenAI,
> deployed on Vercel.
>
> **Status — 2026-06-09:** live on Vercel, 267 tests passing, build + lint clean. Every feature
> screen, the import + categorization pipeline, auth, and per-user sync are shipped. What remains
> is a short, optional roadmap (see the end of this file).
>
> This file is the **current** reference. The blow-by-blow build history lives in git and in the
> design specs under `docs/superpowers/specs/` — it is intentionally not duplicated here.

---

## Running it (for forkers)

```bash
npm install
npm run db:push      # create/sync the Neon schema (drizzle-kit)
npm run db:seed      # load the Swedish sample dataset
npm run dev          # http://localhost:3000
npm test             # vitest (267 tests)
npm run build        # production build (Turbopack)
```

**Environment** (`.env.local`):

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Neon Postgres connection string |
| `OPENAI_API_KEY` | yes (for AI categorization) | OpenAI; without it, import falls back to keyword rules |
| `AUTH_SECRET` | yes | Auth.js session encryption |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | yes | Google OAuth client (redirect URI `…/api/auth/callback/google`) |
| `OWNER_EMAIL` | yes | Single-owner allowlist — only this Google account may sign in (fail-closed) |
| `DEV_USER_ID` | optional | Local-dev bypass: skips Google sign-in and acts as this user id (e.g. `user-stub`). **Unset in production.** |

**Notes**
- This is a **single-owner** app: `OWNER_EMAIL` gates sign-in before any row is written. To make it
  multi-tenant you'd remove the allowlist and key everything off the session user id (already the
  case everywhere — see `getUserId()`).
- Behind a corporate TLS-inspecting proxy, Node may reject Neon/OpenAI TLS
  (`SELF_SIGNED_CERT_IN_CHAIN`). Fix locally with `NODE_OPTIONS=--use-system-ca`.
- `README.md` is still create-next-app boilerplate — it should be replaced with the above.

---

## Architecture

### Data flow — a client SPA over Neon

The app is a **client-side SPA** backed by server actions, not a set of server-rendered pages:

- **Neon is the source of truth.** `src/lib/db/` holds the Drizzle schema (`schema.ts`) and all
  queries (`queries.ts`). `src/app/actions/data.ts` exposes one server action per mutation.
- **`useData()`** (`src/store/data.ts`) is the single read/write facade. It's a TanStack Query
  wrapper over one `['dataset']` entry (the whole user dataset: accounts, categories, tags,
  transactions, budgets, goals, rules). Reads are **persisted to `localStorage`** (instant + offline
  reads). Each mutation updates the cache **optimistically**, persists via a server action, and
  **rolls back + resyncs on failure**.
- **`getUserId()`** (`src/lib/auth.ts`) is the auth seam every query is keyed by — the real session
  user, or `DEV_USER_ID` locally.
- **Local UI state** (privacy mask, selected month, account filter, dashboard layout, nav config)
  lives in a Zustand store (`src/store/ui.ts`); durable preferences also sync to Neon (below).

Implication: the whole dataset is loaded and computed client-side. This is deliberate (instant
navigation, offline reads) and fine at personal scale. Derived figures are memoized; see `Conventions`.

### The spending invariant — `effectiveExpense`

`src/lib/domain/effectiveExpense.ts` is **the only place spending math lives**. A transaction counts
as spending iff: it's not `excluded`, its `kind === "expense"` (income and transfers never count),
and `amount < 0`; for a split, only the `mine` portions count. **Every SEK figure routes through
this — never sum `amount` directly.** `includedNet` is the signed variant for month-net rows.

Money is decimal throughout (`numeric(12,2)`), displayed in Swedish notation (`12 450,75 kr`,
`sv-SE`), and inputs parse `100,75`.

### Categorization pipeline (`src/app/actions/ai.ts`)

For each imported row, in order:
1. **Own-account transfers** — description references one of the user's `accountNumber`s → `transfer`.
2. **User rules** (`src/lib/rules.ts`) — contains / starts-with / exact rules set category/kind/tags
   and run **before the LLM**; a resolving match skips inference.
3. **OpenAI** (`gpt-4o-mini`, structured output → `{kind, categoryId, confidence}`,
   `src/lib/ai/categorize-openai.ts`) for the rest, with a **few-shot built from the user's
   affirmations**.
4. **Keyword fallback** (`src/lib/categorize.ts`) if OpenAI errors.

Low confidence (`< 0.6`) sets `needsReview`.

**The learning loop:** every correction/approval is logged to `categorization_examples`.
`affirmedExamples()` returns the high-signal set — corrections (`corrected = true`) **plus**
detail-panel approvals (`source = 'detail'`) — excluding passive import-keeps. `selectExamples()`
(`src/lib/ai/select-examples.ts`, pure) then **relevance-matches** those to the batch's merchants
(your past "ICA" fixes steer new "ICA" rows), dedupes, and caps, with recent rows as a cold-start
top-up. So both **correcting** and **approving** a category sharpen future predictions.

### Import pipeline (`src/components/import/import-modal.tsx`)

Two-step modal (global, opened from the nav). Parses **SEB** (`;`, decimal-comma) and **Revolut**
exports; the format is auto-detected.

- **Revolut** (`src/lib/parse-revolut.ts`): folds `Fee` into the amount, keeps only `COMPLETED`
  rows, drops `Topup`/`Exchange`, and uses the `Type` column to mark transfers.
- **Non-SEK → SEK conversion** (`src/lib/fx.ts` + `src/app/actions/fx.ts`): foreign rows are
  converted to SEK at import using live ECB rates (Frankfurter, `open.er-api` fallback) so the
  SEK-only model stays correct; the original is kept in the note. A failed rate fetch holds those
  rows back with a Retry; SEK rows still import.
- **Transfer-pair detection** (`detectTransfersOnImport`) pairs new rows against existing ones so
  internal movements aren't double-counted. Duplicates (date+amount+description) are auto-skipped.

### Review & correct

A `needsReview` row shows a warning dot in the list and a "Needs review" filter on `/transactions`.
Open the detail panel to either **change** the category (corrects + logs) or **Approve** the guess
(confirms a correct low-confidence prediction, marks it user-affirmed → 100%, logs the affirmation).
Both feed the few-shot above.

### Auth & single-owner (`src/lib/auth*.ts`, `src/lib/db/claim.ts`)

Auth.js v5 + Google with **database sessions** (4 `auth_*` tables; `users.id` is the app-wide
`userId`). A **single-owner allowlist** (`OWNER_EMAIL`, fail-closed) gates `signIn`. On the owner's
first sign-in, a one-time idempotent `claimStubData` re-points all `user-stub` rows to the real id.
Route protection lives in the `(app)` server layout (`auth()` + `redirect("/signin")`). Pure logic
(`resolveUserId`, allowlist) is unit-tested in `src/lib/auth-helpers.ts`.

### Per-user preferences sync

Dashboard **layout** (widget order + size) and **bottom-nav config** persist in a `user_preferences`
table, keyed by `getUserId()`, so they follow the user across devices. `<PreferencesSync />` (mounted
in the `(app)` layout) hydrates the Zustand store on load and debounce-saves edits (server is source
of truth; `localStorage` is the instant/offline cache; last-write-wins). `masked`/`month`/
`accountFilter` stay device-local.

### PWA

Installable + offline app-shell via a **hand-rolled** `public/sw.js` (app-shell cache, network-first
nav, stale-while-revalidate — deliberately Turbopack-safe, no bundler plugin) + `src/app/manifest.ts`
+ the level-bars icon set (`public/icon*.svg|png`, generated by `scripts/generate-icons.mjs`, plus an
iOS `apple-icon.png`). `<ServiceWorkerRegister />` registers it **in production only** — install/test
from the deployed URL, not local dev. (The `serwist` / `@serwist/next` deps are **unused** — see
roadmap.)

---

## Stack

| Concern | Choice |
|---|---|
| Framework | **Next.js 16** App Router + TypeScript, Turbopack |
| UI | React 19, **Tailwind v4** (CSS `@theme`, no JS config), hand-rolled Radix + `cva` primitives in `src/components/ui/` (not shadcn — full control of the glass aesthetic) |
| Theming | `next-themes`, HSL semantic tokens only (no raw hex), dark-first |
| Motion | `motion` (Framer Motion v12), `<MotionConfig reducedMotion="user">`; springy presets in `src/lib/motion.ts` |
| Data | TanStack Query v5 over `useData()`; Drizzle ORM + Neon serverless |
| Local state | Zustand v5 |
| Drag reorder | `@dnd-kit` (dashboard widgets) |
| Charts | **CSS-width bars + inline SVG** (Recharts was removed — no chart dep) |
| Auth | Auth.js v5 (`next-auth@5`) + `@auth/drizzle-adapter`, Google |
| LLM | OpenAI `gpt-4o-mini` (structured output) |
| Format | `Intl.NumberFormat('sv-SE')`; English chrome |
| Tests | Vitest + React Testing Library |

---

## Repo map

```
src/
  app/
    (app)/            authed routes: dashboard (page.tsx), transactions, budgets, goals,
                      categories, accounts, tags, rules, settings; layout = auth gate
    actions/          server actions: data (CRUD), ai (categorize + training log), fx, auth, preferences
    layout.tsx        root: fonts, Providers, metadata; manifest.ts; apple-icon.png
  components/
    dashboard/        widgets + registry + compute (pure dashboard aggregation)
    transactions/     row, detail panel, split/tag editors
    import/           the import modal
    nav/              bottom nav, account menu, toggles
    ui/               Radix + cva primitives (button, select, dialog, …)
  lib/
    domain/           types + effectiveExpense (the spending invariant) + selectors
    ai/               categorize-openai, select-examples (few-shot selection)
    db/               schema, queries, map (row<->domain), claim, index
    rules.ts fx.ts parse-csv.ts parse-revolut.ts categorize.ts format.ts auth*.ts
  store/              data.ts (TanStack Query facade) + ui.ts (Zustand)
  data/mock.ts        seed dataset (24 categories, sample accounts/transactions)
docs/superpowers/     design specs + implementation plans (the decision record)
scripts/              generate-icons.mjs
public/               sw.js, icons, mock-imports/
```

---

## Conventions

- **TDD.** New behavior gets a failing test first (the suite is the regression net). Pure logic
  (selectors, fx, rules, example selection, parsers) is unit-tested directly; UI tests render with
  `src/test/render.tsx` (`renderWithData` seeds a QueryClient).
- **Spending math only via `effectiveExpense`** — never sum `amount`.
- **Money is decimal** (`numeric(12,2)`), displayed `sv-SE`; parse `100,75`.
- **Dates are ISO `yyyy-mm-dd` strings.** Slice them (`monthKey = date.slice(0,7)`) — don't
  `new Date()`-parse in hot loops (it's slower and shifts months across timezones).
- **Colors are HSL token triplets** (`--primary: 217 91% 60%`), composed with `hsl(var(--x) / a)`.
  No raw hex in components.
- **Memoize derived figures.** The dashboard/transactions pages `useMemo` their aggregations on the
  dataset slices (referentially stable via Query structural sharing); rows are `React.memo`'d.
- **Server actions are the only DB boundary;** components never import `db` directly.

---

## Roadmap — what's left

Everything below is verified against the code as of 2026-06-09. Prioritized.

**P1 — finish the PWA story / cleanup**
- **Overspend alerts via Web Push** — *not built.* `sw.js` has no `push`/`notificationclick`
  handlers and there's no subscription flow or server-side trigger. This is the real remaining PWA
  work (install + offline shell already work).
- **Local-dev DB isolation** — a Neon `dev` branch exists, but `.env.local` still points at the
  prod/real-data branch, so **local dev currently writes to prod data.** Repoint `.env.local` at the
  dev branch, set `DEV_USER_ID=user-stub`, wipe + `db:seed`. (Code side is done via the env bypass.)
- **Cleanup** — drop the unused `serwist` / `@serwist/next` deps; replace the boilerplate `README.md`
  with the "Running it" section above.

**P2 — nice-to-haves**
- **Dashboard forecast widget** — `budgetForecasts()` (history-blended, current-month projection)
  exists and is surfaced on `/budgets`; a dashboard widget would reuse it.
- **Light-theme ("Silver Slate") polish** — the light theme exists in `globals.css` but was tuned
  less than dark; a polish pass is deferred.
- **Offline write queue/replay** — reads work offline (localStorage cache); writes need the network
  (optimistic + rollback). A queue would let edits made offline replay on reconnect.

**Optional / only if needed**
- **`/spending` explorer page** — a dedicated cross-filtering page for deeper exploration. Only build
  if the dashboard breakdown widget proves insufficient
  (`docs/superpowers/specs/2026-06-01-dashboard-spending-breakdown-design.md`, "Out of scope").

---

## Feature inventory (shipped)

A quick map of what's done, for orientation. Details + rationale are in the design specs.

- **Dashboard** — drag-reorderable widgets with per-widget S/M/L sizing: hero "This month",
  spending breakdown (Categories | Tags | Accounts toggle, ±% vs last month, tap-to-expand
  subcategories), trend (with subcategory drill-down), budgets, goals, recent activity, calendar
  heatmap. Layout persists per user.
- **Transactions** — search + filters (category/account/tag/needs-review/has-splits), month nav with
  filtered count + Spent, master-detail (desktop sticky panel + mobile sheet). Detail panel: category
  + **Approve**, tags, split (among N people; only `mine` counts), kind, exclude, notes.
- **Budgets / Goals / Categories / Tags / Accounts** — full CRUD; budgets have health + forecast;
  goals are transaction-driven (`baseline + Σ|linked transfers|`); categories nest (parent/sub).
- **Rules** — `/rules` page: description rules set category/kind/tags, run before the LLM at import,
  with per-rule and bulk backfill; per-month suggestions mined from corrected data.
- **Import** — SEB + Revolut CSV, non-SEK→SEK conversion, dedupe, transfer-pair detection, editable
  review with kind/category/confidence and a filter bar.
- **AI categorization + learning loop** — rules → OpenAI few-shot (built from your corrections +
  approvals, relevance-matched) → keyword fallback; training set in `categorization_examples`.
- **Auth** — Google sign-in (Auth.js v5), single-owner allowlist, stub-data claim, dev bypass.
- **Per-user sync** — dashboard layout + nav config in Neon; account avatar + sign-out in every header.
- **PWA + polish** — installable, offline shell, level-bars icon; native tap feedback, iOS safe-area,
  springy detail-panel cross-fade, memoized aggregations, mobile-contained bottom nav.
