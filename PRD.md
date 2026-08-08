# Pegels — Product Requirements Document

> **Purpose of this document.** This is a build-from-scratch specification for **Pegels**, a
> single-user Swedish personal-finance PWA. It describes *what* to build and *why*, with acceptance
> criteria, the domain model, and the non-obvious business rules — enough to reproduce the product
> independently. It is requirements-first; `PLAN.md` is the companion *architecture* reference and
> `docs/superpowers/specs/` holds the per-feature design decision record.
>
> **Status of the reference implementation (2026-06-09):** shipped and live on Vercel; 269 tests
> passing; build + lint clean.
>
> **How to read requirement IDs:** `FR-x` functional, `NFR-x` non-functional, `BR-x` business rule.
> Each functional area lists user stories and acceptance criteria (AC).

---

## 1. Overview

Pegels lets one person bring their bank transactions into one place, have them **auto-categorized by
an LLM that learns from their corrections**, and understand their spending through calm, glanceable
analysis (dashboard, budgets, trends). It is offline-capable, installable, and Swedish-first
in its money formatting while keeping English UI chrome.

**The problem it solves.** Bank apps show transactions but not *understanding*: no consistent
categories, no learning, no budget framing, no cross-account view. Manual spreadsheets are
accurate but tedious. Pegels automates categorization, keeps the human in the loop for low-confidence
guesses, and turns the corrected history into a private training signal.

**Product principles.**
- **One source of truth for spending math.** Every SEK figure is derived one way (see BR-1); the UI
  never sums raw amounts.
- **Human-in-the-loop AI.** The model proposes; the user disposes; corrections and approvals both
  teach it.
- **Calm, instant, offline.** The whole dataset loads client-side; reads are instant and work
  offline; navigation never blocks on the network.
- **Single-owner by default.** Built for one person; multi-tenant-ready underneath (every row is
  keyed by user id) but gated to one allow-listed account.

---

## 2. Goals & non-goals

**Goals**
- G1 — Import bank CSV exports (SEB and Revolut), de-duplicated, with foreign currency converted to
  SEK at import time.
- G2 — Auto-categorize each transaction (retrieval-grounded LLM) and flag low-confidence
  rows for review. A failure is surfaced, never papered over with a guess.
- G3 — Learn from every correction and approval so future predictions improve.
- G4 — Provide budgets, categories and tags with full CRUD, and a page for curating what the
  categorizer has learned.
- G5 — Give a focused dashboard and a calm spending breakdown/trend view.
- G6 — Work as an installable, offline-capable PWA on phone and desktop.
- G7 — Be private and secure: single-owner sign-in, per-user data isolation.

**Non-goals**
- NG1 — Bank API / Open Banking connections (CSV import only).
- NG2 — Multi-currency *display* (the model is SEK-only; foreign is converted on import).
- NG3 — Multi-user collaboration, sharing, or roles beyond the single owner.
- NG4 — Investment/portfolio tracking, bills/invoicing, or double-entry accounting.
- NG5 — Native mobile apps (PWA only).

---

## 3. Users & personas

**Primary (and only) persona — "The Owner."** A financially-engaged individual in Sweden who
exports CSVs from their bank(s), wants their money auto-organized, and will occasionally correct a
category. They use the app on phone (primary) and desktop. They value privacy (their data is theirs),
speed, and a quiet, non-judgmental tone.

There are no secondary personas. The app is **single-owner**: exactly one Google account may sign in.

---

## 4. Scope

**In scope:** CSV import (SEB + Revolut, incl. localized Revolut exports), FX conversion,
de-duplication, transfer-pair detection, the categorization pipeline + learning loop, transactions
(list/filter/detail/edit/split/tag/delete), dashboard, budgets,
categories (nested), tags, corpus curation + accuracy measurement, settings,
Google auth with single-owner allowlist, PWA (install + offline shell).

**Out of scope (this version):** Web Push overspend alerts, an offline write queue, a dedicated
cross-filtering "spending explorer" page, light-theme polish, and any NG-* item above. (See §13.)

---

## 5. Domain model & core invariants

All amounts are **SEK decimals**. Negative `amount` = expense; positive = income or transfer-in.
Dates are **ISO `yyyy-mm-dd` strings**.

### 5.1 Entities

| Entity | Key fields | Notes |
|---|---|---|
| **Account** | `id, name, type, kind('spending'\|'savings'), icon(emoji), color(hsl), balance, accountNumber?, archived` | `savings` never counts toward expenses. A transaction whose description references an `accountNumber` is auto-classified `transfer`. |
| **Category** | `id, name, icon(emoji), color(hsl), parentId(null=top-level)` | One level of nesting (parent → sub). |
| **Tag** | `id, name, color(hsl)` | Free-form labels, many-per-transaction. |
| **Transaction** | `id, date, description, amount(signed SEK), accountId, categoryId?, predictedCategoryId?, categoryConfidence?(0..1, internal), categoryLevel?('high'\|'medium'\|'low'), categorySource('model'\|'user'), needsReview, excluded?, tagIds[], splits?[], notes?, kind('expense'\|'income'\|'transfer')` | The central entity. |
| **Split** | `id, label?, amount(absolute SEK), mine(bool)` | A portion of a transaction; **only `mine` portions count** toward expenses. |
| **Budget** | `id, categoryId, limit(positive SEK), month('yyyy-mm'\|null)` | `null` month = repeats every month. Targets a top-level or sub category. |
| **CategorizationExample** | `id, rawDescription, cleanedDescription, amount, predictedKind?, predictedCategoryId?, predictedConfidence?, finalKind, finalCategoryId?, corrected(bool), source('import'\|'detail'), createdAt` | The training set (BR-4). |
| **Auth (users/accounts/sessions/verificationTokens)** | Auth.js standard shape | `users.id` is the app-wide `userId`. |

Every domain table is scoped by `userId`. Embedded arrays (`tagIds`, `splits`, `addTagIds`,
`layout`, `navConfig`) are stored as JSONB — document-scoped, never queried independently.

### 5.2 Core invariants (business rules)

- **BR-1 — The spending invariant (`effectiveExpense`).** A transaction counts as spending **iff**:
  it is not `excluded`, `kind === 'expense'`, and `amount < 0`. For a transaction with splits, only
  the sum of `mine` split portions counts (not the whole amount). Income and transfers **never**
  count as spending. **This is the single function all SEK spending figures route through — code must
  never sum `amount` directly.** A signed "net" variant exists for month-net rows.
- **BR-2 — Money & locale.** Money is decimal `numeric(12,2)`. Displayed in Swedish notation via
  `Intl.NumberFormat('sv-SE')` (e.g. `12 450,75 kr`). Inputs accept `100,75` (decimal comma) and
  `1 234,56` (space thousands). Dates are sliced for month keys (`date.slice(0,7)`), never
  `new Date()`-parsed in hot loops (timezone-shift + slower).
- **BR-3 — Categorization order** (see §6.4).
- **BR-4 — Learning signal** (see §6.4).
- **BR-5 — Budget health.** `pct = spend / limit`; health is `over` (≥1), `warning` (≥0.85), else
  `under`. Spend uses BR-1 over the budget's category (including subcategories) for the active month.
- **BR-6 — Forecast (fixed vs variable).** A charge is **recurring** when it appears in ≥3 distinct
  months of the trailing 6 completed months, ~once a month, with amount spread `MAD/median ≤ 0.25`
  and day-of-month `MAD ≤ 4`. Projection is
  `landed + recurringExpected + variableProjected`, where only the **variable** component is
  extrapolated and only across the **remaining** days. A charge that hasn't landed stays in
  `recurringExpected` even when overdue. `dailyAllowance = (target − landed − recurringExpected) /
  daysLeft`, and is `null` for a category that is ≥90% fixed.
- **BR-7 — Duplicate detection.** Two transactions are duplicates iff same
  `date | amount | description` within the same account; duplicates are auto-skipped on import.
- **BR-8 — Colors are HSL token triplets** (`"217 91% 60%"`), composed `hsl(var(--x) / a)`. No raw
  hex in components.

---

## 6. Functional requirements

### 6.1 Authentication & access (single-owner)

**Story:** *As the owner, I sign in with Google so only I can see and edit my finances.*

- FR-1.1 — Sign-in via Google (Auth.js v5 + `@auth/drizzle-adapter`, **database sessions**).
- FR-1.2 — **Single-owner allowlist (fail-closed):** sign-in is permitted only if the Google email
  equals `OWNER_EMAIL` (case-insensitive). Any other account is rejected before any row is written.
- FR-1.3 — All `(app)` routes are protected: an unauthenticated request redirects to `/signin`.
- FR-1.4 — **Stub-data claim:** on the owner's first successful sign-in, a one-time, idempotent
  operation re-points all rows owned by the dev/stub user id to the real `users.id`.
- FR-1.5 — **Dev bypass:** if `DEV_USER_ID` is set (local only), sign-in is skipped and that id acts
  as the session user. Must be unset in production.
- FR-1.6 — A single auth seam (`getUserId()`) returns the real session user id or `DEV_USER_ID`;
  **every query is keyed by it.** Components never read the session directly for data scoping.

**AC:** Non-owner Google account cannot sign in or create data. Owner's pre-auth (stub) data appears
after first sign-in. Visiting any authed route while signed out redirects to `/signin`.

### 6.2 Data model & sync

**Story:** *As the owner, my data loads instantly, works offline for reads, and stays consistent.*

- FR-2.1 — A single read/write facade (`useData()`) exposes the whole dataset (accounts, categories,
  tags, transactions, budgets) and one mutation per operation.
- FR-2.2 — Reads come from one cache entry, **persisted to `localStorage`** for instant + offline
  reads, rehydrated on load.
- FR-2.3 — Every mutation is **optimistic**: update the cache immediately, persist via a server
  action, and on failure **roll back and resync** from the server.
- FR-2.4 — **Server actions are the only DB boundary.** Components never import the DB client.
- FR-2.5 — Mutations available: upsert/remove for each entity; transactions also support
  add (single/batch), update (patch), and **delete** (FR-6.5.8).

**AC:** A mutation reflects in the UI before the network returns; a forced server error rolls the UI
back to the prior state. Reloading offline still shows the last-synced dataset.

### 6.3 Import

**Story:** *As the owner, I upload a CSV from my bank and get clean, de-duplicated, SEK transactions
ready to review.*

A two-step modal (Upload → Review), opened globally from the nav.

- FR-3.1 — **Format auto-detection.** SEB and Revolut exports are recognized from their headers; a
  generic CSV path with adjustable column mapping (Date/Description/Amount) handles anything else.
- FR-3.2 — **SEB parsing:** `;`-delimited, decimal-comma amounts; map date/description/amount by
  header hints.
- FR-3.3 — **Revolut parsing** (`parse-revolut`): keep only `COMPLETED` rows; drop `Topup`/`Exchange`
  (internal movements); **fold `Fee` into the amount**; read the `Type` column to set `transfer`
  (and `Card Payment`/`Charge` → expense); read the `Currency` column per row.
- FR-3.4 — **Localized Revolut exports.** Revolut localizes both column headers and cell values to the
  account language. The parser must accept known language variants for the columns it reads and the
  values it switches on. **Reference set (English + Dutch):**

  | Field / value | English | Dutch |
  |---|---|---|
  | Header: Amount / Fee / State / Currency | `Amount` `Fee` `State` `Currency` | `Bedrag` `Kosten` `Status` `Valuta` |
  | Header: Started Date / Description | `Started Date` `Description` | `Startdatum` `Beschrijving` |
  | State = completed | `COMPLETED` | `VOLTOOID` |
  | Type = top-up / exchange (dropped) | `Topup` `Exchange` | `Geld toevoegen` `Wisselen` |
  | Type = transfer / card payment | `Transfer` `Card Payment` | `Overschrijving` `Kaartbetaling` |

  Detection (`isRevolutCsv`) and column lookup resolve through a canonical-field → aliases map, so
  adding a language is a data change. *(Bug class this prevents: an unrecognized localized export
  silently falls to the generic SEK path and imports foreign amounts unconverted.)*
- FR-3.5 — **Foreign → SEK conversion** (`fx`): collect every non-SEK currency in the file, fetch
  live rates (primary: Frankfurter/ECB; fallback: `open.er-api.com`, ~160 currencies incl. those ECB
  omits), and convert each row to SEK, keeping the original amount + rate in the transaction note
  (e.g. `−251.00 EUR @ 11.45`). The conversion is **currency-agnostic** (EUR, COP, USD, …).
- FR-3.6 — **Failed rate fetch:** rows in the unfetched currency are **held back** (not importable)
  with a visible notice and a **Retry**; SEK rows still import. (Never import a foreign amount as SEK.)
- FR-3.7 — **De-duplication** (BR-6): duplicates of existing transactions are flagged and excluded by
  default; a "Hide duplicates" filter is available.
- FR-3.8 — **Transfer-pair detection** (`detectTransfersOnImport`): pair new rows against existing
  ones so internal movements between the user's own accounts aren't double-counted; matched existing
  legs are reclassified as `transfer` on import.
- FR-3.9 — **Editable review screen:** each row shows include checkbox, date, amount, description,
  kind, and (for expenses) category + a confidence dot naming the level on hover. A filter bar offers All/Expense/Transfer/
  Income, Needs-review, Uncategorized, Hide-duplicates, and search. A live summary shows
  will-import/duplicates/date-range/needs-review/money-in/out/net/type counts. Confirm imports only
  the included rows and logs AI predictions vs. final choices (BR-4).

**AC:** A SEB and a Revolut (English *and* Dutch) export each import with correct dates, descriptions,
SEK amounts (foreign converted), transfers marked, and duplicates skipped. Disabling the network at
import time holds foreign rows back with a Retry rather than importing them unconverted.

### 6.4 Categorization & learning loop

**Story:** *As the owner, transactions are auto-categorized and the system gets better every time I
correct or approve one.*

- FR-4.1 — **BR-3 Pipeline order**, per imported row:
  1. **Own-account transfer** — description references one of the user's `accountNumber`s → `transfer`.
  3. **Retrieval + OpenAI** (`gpt-4o-mini`, structured output →
     `{kind, categoryId, tagIds, confidence}`) for the rest, grounded in examples retrieved from
     the owner's own confirmations.
  There is deliberately **no fallback**: if OpenAI errors the import surfaces it. Rows resolved by
  steps 1–2 are unaffected by an outage.
- FR-4.2 — **Confidence is categorical.** `gradeConfidence` labels each row from the retrieval
  evidence: `high` (a near-identical approved merchant agreed), `medium` (evidence existed but
  nothing decisive), `low` (nothing retrieved). `needsReview` is `level === 'low'`. Each label is
  shown with its reason on hover, so "low" reads as "nothing like this in your approved examples
  yet" rather than as the model hedging. The raw
  score is retained for the eval's calibration metric and is **never shown** — on the hold-out its
  mean on right and wrong answers are indistinguishable, so a percentage would overstate what is
  known.
- FR-4.3 — **BR-4 Learning signal.** Every correction and approval is logged to
  `categorization_examples`. The **high-signal set** = corrections (`corrected=true`) **plus**
  detail-panel approvals (`source='detail'`), excluding passive import-keeps.
- FR-4.4 — **Retrieval** (`retrieve`): two arms fused by reciprocal rank — pgvector cosine over the
  embedded corpus, and lexical merchant-token overlap — capped per row and diversified so one
  merchant cannot fill every slot. A hit below the similarity floor is noise and is dropped, so an
  unrecognised merchant retrieves nothing and is flagged for review.
- FR-4.5 — `OPENAI_API_KEY` is **required**. Without it, import fails with a visible error.
- FR-4.6 — **Curation** (`/training`): unreviewed merchants are queued most-seen-first; approving
  one makes it retrievable, dismissing one is sticky. Accuracy is measured against a hold-out
  (`npm run eval`).

**AC:** A low-confidence row is flagged; correcting it changes future predictions for similar
merchants; approving a correct low-confidence guess also improves them. The few-shot selection is
unit-tested as a pure function.

### 6.5 Transactions

**Story:** *As the owner, I review, filter, edit, split, tag, and delete my transactions.*

- FR-6.5.1 — A searchable, filterable list (filters: category, account, tag, needs-review,
  has-splits) with month navigation showing the filtered count and Spent total (via BR-1).
- FR-6.5.2 — **Master-detail:** sticky side panel on desktop, bottom sheet on mobile.
- FR-6.5.3 — Detail panel: set category (logs a correction) or **Approve** a low-confidence guess
  (marks user-affirmed → 100%, logs an approval). Both feed BR-4.
- FR-6.5.4 — Edit tags (add/create), notes, and `kind` (expense/income/transfer).
- FR-6.5.5 — **Split** a transaction among N people; only the `mine` portion counts (BR-1).
- FR-6.5.6 — **Exclude** a transaction ("don't count this") — stays in the list, removed from all
  spending math.
- FR-6.5.7 — Rows show kind/transfer/split/ignored badges and a confidence dot; list rows are
  memoized for scroll performance.
- FR-6.5.8 — **Delete a transaction (permanent).** A `danger` "Delete transaction" action in the
  detail panel opens a **confirm dialog** ("This permanently removes it… can't be undone"). Confirm
  deletes the row from the database (optimistic + rollback) and clears the selection, closing the
  panel/sheet. No undo. (Distinct from Exclude, which is reversible and keeps the row.)

**AC:** Filters and search narrow the list and totals correctly. Correcting/approving updates the
training set. A split's `mine` share is what counts. Deleting prompts for confirmation, removes the
row from the DB, and closes the panel; a server failure restores the row.

### 6.6 Dashboard

**Story:** *As the owner, I open the app to a calm overview of this month.*

- FR-6.6.1 — Widgets: hero **This month**, **spending breakdown** (Categories | Tags | Accounts
  toggle, ±% vs last month, tap-to-expand subcategories), **trend** (with subcategory drill-down),
  **where you'll land** (per-category projection, verdict and daily allowance — BR-6),
  **budgets**, **recent activity**, **calendar heatmap**.
- FR-6.6.2 — The widget order and per-widget size are **fixed** (`DASHBOARD_LAYOUT` in the registry);
  the dashboard is not user-arrangeable.
- FR-6.6.3 — The hero reports **what is left to spend per day** with fixed costs deducted, plus
  the month's fixed/variable split — never a backward-looking daily average.
- FR-6.6.4 — All aggregation is pure (`dashboard/compute`) and memoized on dataset slices.

**AC:** A fixed cost landing on the 1st is counted once, not extrapolated across the month.
Breakdown ±% and trends reflect the selected month and active filters. Heatmap is Monday-first.

### 6.7 Categories

**Story:** *As the owner, I organize spending into nested categories.*

- FR-6.7.1 — Full CRUD; categories nest one level (parent → sub) with emoji icon + HSL color.
- FR-6.7.2 — Deleting a category **detaches its transactions** (`categoryId → null`), atomically;
  it does not delete the transactions.

**AC:** Sub-categories render under their parent; deleting a parent/sub leaves its transactions
uncategorized rather than orphaning or deleting them.

### 6.8 Tags

- FR-6.8.1 — Full CRUD; tags are many-per-transaction with HSL color.
- FR-6.8.2 — Deleting a tag **strips it from every transaction's `tagIds`**, atomically.

### 6.9 Budgets

- FR-6.9.1 — Full CRUD; a budget targets a top-level or sub category with a positive monthly `limit`,
  either for a specific `month` or repeating (`month=null`).
- FR-6.9.2 — Show **health** (BR-5) and a **forecast** (BR-6, shared with the dashboard).

### 6.10 Settings

- FR-6.10.1 — Settings page: account avatar + sign-out (also in every header), data reset/clear.
- FR-6.10.2 — `masked` (privacy blur), selected `month`, and `accountFilter` stay **device-local**
  (not synced).

### 6.11 PWA

- FR-6.11.1 — Installable (manifest + icon set) and offline app-shell via a **hand-rolled** service
  worker (app-shell cache, network-first navigation, stale-while-revalidate — no bundler plugin).
- FR-6.11.2 — Register the service worker **in production only** (install/test from the deployed URL).
- FR-6.11.3 — Privacy mask: a toggle blurs all monetary amounts for over-the-shoulder privacy.

---

## 7. Non-functional requirements

- **NFR-1 Performance.** Navigation is instant (client SPA over a single cached dataset). Derived
  figures are memoized; list rows are `React.memo`'d; aggregation is pure and recomputed only on
  dataset changes. Avoid `new Date()`-parsing in hot loops (BR-2).
- **NFR-2 Offline.** Reads work offline from the `localStorage`-persisted cache. Writes require the
  network (optimistic + rollback); an offline write queue is out of scope (§13).
- **NFR-3 Security & privacy.** Single-owner allowlist (fail-closed). Every domain row is scoped by
  `userId`; the server action layer is the only DB boundary. Secrets via env only.
- **NFR-4 Accessibility.** Respect `prefers-reduced-motion` (motion config); progress/ring elements
  expose ARIA values; interactive controls are labeled; dialogs trap focus (Radix primitives).
- **NFR-5 Localization of money/dates.** SEK + `sv-SE` formatting; ISO dates; English UI chrome.
  Import parsing tolerates localized bank exports (FR-3.4).
- **NFR-6 Theming.** Dark-first; HSL semantic tokens only (no raw hex, BR-7); `next-themes`.
- **NFR-7 Testing (TDD).** New behavior gets a failing test first. Pure logic (selectors, fx, retrieval,
  example selection, parsers, mutations) is unit-tested directly; UI tests render with a seeded
  QueryClient. The suite is the regression net (269 tests in the reference build).
- **NFR-8 Resilience.** FX failures degrade gracefully (held-back rows + retry) and a retrieval
  failure still classifies, without evidence. An OpenAI failure is **surfaced, not absorbed** — a
  plausible-looking guess hides an outage indefinitely.
  Behind a TLS-inspecting proxy, Node may reject outbound TLS (`SELF_SIGNED_CERT_IN_CHAIN`) — document
  the `NODE_OPTIONS=--use-system-ca` local workaround.

---

## 8. Technical requirements & architecture (prescriptive)

To reproduce *this* implementation:

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript, Turbopack |
| UI | React 19, Tailwind v4 (CSS `@theme`, no JS config), hand-rolled Radix + `cva` primitives (not shadcn — full control of the glass aesthetic) |
| Theming | `next-themes`, HSL semantic tokens, dark-first |
| Motion | `motion` (Framer Motion v12), `<MotionConfig reducedMotion="user">`, spring presets |
| Data | TanStack Query v5 over a single `['dataset']` entry, persisted to `localStorage`; Drizzle ORM + Neon serverless Postgres |
| Local state | Zustand v5 |
| Charts | CSS-width bars + inline SVG (no chart dependency) |
| Auth | Auth.js v5 (`next-auth@5`) + `@auth/drizzle-adapter`, Google, database sessions |
| LLM | OpenAI `gpt-4o-mini`, structured output |
| Format | `Intl.NumberFormat('sv-SE')`; English chrome |
| Tests | Vitest + React Testing Library |
| Deploy | Vercel |

**Architecture shape (data flow):** client SPA → `useData()` (TanStack Query facade) → server
actions (`app/actions/*`) → Drizzle queries (`lib/db/*`) → Neon. `getUserId()` (`lib/auth.ts`) is the
auth seam keying every query. UI-local state in `lib`/`store/ui.ts` (Zustand). Spending math only via
`lib/domain/effectiveExpense.ts`. See `PLAN.md` for the full architecture writeup and repo map.

---

## 9. Data model (DDL summary)

Domain tables (each `userId`-scoped, with a `userId` index; `transactions` indexed by `(userId,
date)`): `accounts`, `categories`, `tags`, `transactions`, `budgets`,
`categorization_examples`, `eval_runs`. Auth tables (Auth.js shape):
`auth_users` (`id` = app `userId`), `auth_accounts`, `auth_sessions`, `auth_verification_tokens`.
Money columns are `numeric(12,2)`; confidence/priority are `real`; `tagIds`/`splits`/`addTagIds`/
`layout`/`navConfig` are `jsonb`; dates are `text` ISO strings. Field-level detail is in §5.1 and the
Drizzle schema.

---

## 10. Environment & configuration

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Neon Postgres connection string |
| `OPENAI_API_KEY` | yes | OpenAI. No fallback — import fails visibly without a valid key |
| `AUTH_SECRET` | yes | Auth.js session encryption |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | yes | Google OAuth (redirect `…/api/auth/callback/google`) |
| `OWNER_EMAIL` | yes | Single-owner allowlist (fail-closed) |
| `DEV_USER_ID` | optional | Local-dev bypass; **unset in production** |

Bootstrap: `npm install` → `npm run db:push` (sync schema) → `npm run db:seed` (sample data) →
`npm run dev`. Tests: `npm test`. Build: `npm run build`.

---

## 11. Acceptance / definition of done

A reproduction is "done" when: a SEB and a Revolut (English **and** Dutch) CSV import correctly with
FX conversion, dedupe, and transfer detection; the categorization pipeline + learning loop work
(and fail visibly without a key); transactions can be reviewed/edited/split/tagged/excluded/
**deleted-with-confirmation**; budgets/categories/tags have full CRUD with their business
rules (BR-5, detach/strip on delete); Google
single-owner auth gates access and claims stub data; the PWA installs and serves an offline shell; and
the test suite passes with build + lint clean.

---

## 12. Key risks & mitigations

- **Localized bank exports** silently mis-importing (the EUR-as-SEK class): mitigated by FR-3.4 alias
  detection + FR-3.6 hold-back-on-failed-FX (never import foreign as SEK).
- **AI/network failure:** surfaced to the user (FR-4.5), never masked by a guess; held-back FX rows
  with retry (FR-3.6).
- **Local dev writing to prod data:** use a separate Neon dev branch + `DEV_USER_ID` (see §13/PLAN).
- **Commit attribution / TLS proxy:** see PLAN.md notes (repo-local git identity; `--use-system-ca`).

---

## 13. Out of scope / future roadmap

Deferred (verified against the code; tracked in `PLAN.md` / `BACKLOG.md`):
- **Overspend alerts via Web Push** — the only substantial remaining PWA work (no push handlers/
  subscription/trigger yet).
- **Local-dev DB isolation** — repoint `.env.local` at a Neon `dev` branch; code-side bypass is done.
- **Light-theme polish**, **offline write queue/replay**, and an optional **`/spending` explorer**
  page (only if the dashboard breakdown proves insufficient).
- **Cleanup:** drop unused deps; keep `README.md` aligned with the run instructions.
