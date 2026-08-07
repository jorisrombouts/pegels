# Pegels — RAG categorization, real forecasting, and a simplification pass

## Context

Four changes, driven by the observation that **categorization quality is the foundation everything
else sits on** — the dashboard is only as good as the labels underneath it.

1. **Categorization is half-learned.** Today it's a ladder: own-account check → hand-written rules →
   `gpt-4o-mini` → a hardcoded Swedish keyword table. Corrections *are* logged to
   `categorization_examples` and fed back as few-shot, but retrieval is lexical token-overlap only,
   **tags are never learned** (the table stores kind + category only), and the LLM runs *exactly
   once*, at import. Hand-maintaining rules doesn't scale and doesn't improve on its own.
2. **The dashboard's projection is wrong, and known to be.** `projected = (spent/daysElapsed) ×
   daysInMonth` (`src/components/dashboard/compute.ts:31`). On day 3, after rent lands, it
   extrapolates a 12 500 kr fixed cost across ten more rents. There is no per-category forecast at
   all, and "kr/day" is a backward-looking average with no target — which is why it reads as noise.
3. **Unused surface area.** Savings goals, the parked pace widget, and dashboard/nav layout
   customization are all machinery that isn't earning its keep.
4. **Manual adds are dumb.** `quick-add-modal.tsx` takes the category verbatim from the form,
   hardcodes `categorySource: "user"` / `needsReview: false`, never calls the categorizer, and never
   logs an example. It also can't create transfers.

**Outcome:** every transaction is categorized *and tagged* by an LLM grounded in pgvector retrieval
over a user-curated corpus; a `/training` page makes that corpus editable and its accuracy
measurable; the dashboard answers "where will I land, per category, and do I need to adjust";
and the app carries less.

### Decisions already made

- **No hand-written rules, and no deterministic merchant-key short-circuit.** Every transaction goes
  through embedding retrieval → few-shot → LLM. `src/lib/rules.ts`, `src/lib/categorize.ts`, the
  `categorization_rules` table, `/rules`, and the seed rules are all deleted.
- Forecasting uses a **fixed vs variable split**.
- A **hold-out eval harness plus in-app accuracy panel** is in scope.
- Cut: **savings goals**, the **parked pace widget**, **dashboard layout + nav editing**.
- Keep: calendar heatmap, transaction splits.

> **One honest flag.** The corpus is uniquely keyed on `(userId, dedupKey)` where `dedupKey` is a
> normalized merchant string — so forty "ICA MAXI HANINGE" corrections collapse into one row with
> `hitCount = 40`. This is **corpus consolidation, not the memory layer you rejected**: it never
> short-circuits the LLM; every row still gets embedded, retrieved for, and classified. Without it,
> one heavily-corrected merchant floods retrieval and the table grows without bound.
> Cost: a genuinely ambiguous merchant (a bare `KLARNA`) collapses to a single label. Escape hatch —
> a "split entry" action on `/training` creating `klarna#groceries` — is documented, not built in v1.

### Recommended order

**C → B → A → D.** C shrinks the surface B and A touch (killing layout editing removes the persisted-
state migrations that goals removal and new widgets would otherwise each need). B is pure functions
with no infra risk and fixes a visibly wrong number. A is the largest and riskiest. D wants A in
place to be worth much. B can run in a parallel lane; A cannot (it collides with C on `schema.ts`,
`queries.ts`, `mock.ts`, `dataset-mutations.ts`).

**Step 0:** write this design to `docs/superpowers/specs/2026-08-06-rag-categorization-and-forecasting-design.md`
and commit, per the repo's existing spec convention.

---

# Track C — Simplification (do first)

### C1. Remove savings goals

Order that keeps the build green: **UI → store/actions → selectors → domain types → DB → tests → docs.**

Delete outright: `src/app/(app)/goals/`, `src/components/goals/` (incl. `goal-editor.test.tsx`).

Then strip references:

| Layer | Files |
|---|---|
| Schema/DB | `src/lib/db/schema.ts` (drop `goals` table + `transactions.goalId`), `map.ts` (`rowToGoal`/`goalToRow`, `goalId` in both transaction mappers), `queries.ts` (`upsertGoal`, `removeGoal`, `getDataset` batch, `clearAll`, `replaceAll`), `claim.ts` (`CLAIMABLE_TABLES`), `seed.ts` (log line) |
| Domain | `types.ts` (`Goal` interface, `Transaction.goalId`), `selectors.ts` (`GoalProgress`, `goalSaved`, `goalProgress`) |
| Store/actions | `actions/data.ts`, `store/data.ts`, `store/dataset-mutations.ts` (`applyUpsertGoal`/`applyRemoveGoal`, `emptyDataset.goals`), `data/mock.ts` (`Dataset.goals`, seed goals, `t()` default) |
| UI | `dashboard/registry.tsx` (`goals` widget + title), `dashboard/compute.ts`, `nav-items.ts`, `transaction-detail.tsx` (the "Counts toward goal" `Select` + the `goalId` reset in the Type handler), `settings/page.tsx` copy |
| Tests | `vitest.setup.ts` (drop `upsertGoal`/`removeGoal` from the `@/app/actions/data` mock — **must match the real export surface or every component test fails at import**), plus `goalId: null` removal across ~8 fixture files |
| Docs | `PRD.md` (§6.10, BR-5, entity table, FR-6.5.4, FR-6.6.1), `PLAN.md`, `BACKLOG.md` (delete the "Saving goals — keep, simplify, or cut?" entry — this resolves it), `README.md:5`. `docs/superpowers/**` is frozen and exempt from `npm run check:docs` — leave it |

**`detectTransfersOnImport` (`selectors.ts:471`) survives but loses its goal linkage.** Drop the
`goals` param and `goalByAccount`; both branches collapse to `existingUpdates.push({ id: e.id })`;
`ExistingTransferUpdate` becomes `{ id: string }`. Callers: `import-modal.tsx:180,298`.

**Do not** remove `Account.kind === "savings"` — it drives `capitalSummary` and the `spendByAccount`
spending-only filter.

Migration: `npm run db:push` drops `goals` and `transactions.goal_id`. Run it **as its own push**,
interactively, and read the statement list before confirming. ~30 000 kr of seeded `baseline` is lost;
nothing else reads it.

### C2. Remove the parked pace widget

Delete `src/components/dashboard/safe-to-spend-widget.tsx` + its test, the `pace` entry in
`registry.tsx` `widgets`/`widgetTitles`, and the `pace` whitelist in `registry.test.tsx:26`.

### C3. Remove dashboard layout + nav editing

This is the cut with the widest simplification payoff — it deletes the entire persisted-preferences
subsystem, which is exactly the machinery that would otherwise need a migration for C1's widget
removal *and* for Track B's new widgets.

Delete: `src/components/dashboard/sortable-widget.tsx` + test, `src/app/actions/preferences.ts`,
`src/lib/preferences.ts` (+ test), `src/components/preferences-sync.tsx`, the `user_preferences`
table (it holds **only** `layout` and `navConfig`), and `NavigationSection` in `settings/page.tsx`.

In `src/store/ui.ts`: drop `layout`, `navConfig`, `defaultLayout`, `defaultNavConfig`,
`migrateLayoutToV3`, `setLayout`, `setNavPrimary`, `moveNavItem`, `resetNav`, and the `partialize`/
`migrate` entries for them. Keep `month`, `accountFilter`, and the modal-open flags.

`src/app/(app)/page.tsx` renders a **fixed ordered array** of widget ids with fixed spans — no
dnd-kit context, no size picker, no edit mode. `bottom-nav.tsx` renders straight from `nav-items.ts`.

Remove deps: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.

Update `src/store/ui.test.ts` (the `primaryKeys()` / `setNavPrimary` tests go away).

**Gate:** `npm test` green, `npm run lint`, `npm run build`, and `/` + `/transactions` + `/budgets`
render.

---

# Track B — Fixed vs variable forecasting

New module `src/lib/forecast/`. Everything pure, `today` always injected — **no `Date.now()` in this
directory** (matches the `monthProgress` / `budgetForecasts` convention).

```
src/lib/forecast/normalize.ts          recurringKey
src/lib/forecast/recurring.ts          detectRecurring
src/lib/forecast/category-forecast.ts  categoryForecasts, monthForecast
```

### B1. Recurrence detection

```ts
// src/lib/forecast/normalize.ts
/**
 * FORECAST-ONLY. Groups repeat charges into a time series. Deliberately NOT shared with
 * categorization — this key never influences a label.
 */
export function recurringKey(description: string): string;
```

Pipeline: reuse `cleanDescription` (`src/lib/parse-csv.ts:103`, already strips a trailing
`/yy-mm-dd`) → lowercase → drop digit runs ≥2 → drop Swedish month names (`januari…december`,
`jan…dec`) → drop bank noise (`autogiro`, `betalning`, `kortköp`, `överföring`) → collapse
whitespace → **keep the first 3 tokens**. Truncating to 3 tokens is what collapses `HYRA MARS` and
`HYRA APRIL`: Swedish bank descriptions put the merchant first and the variable part last.

```ts
export interface RecurringCharge {
  key: string; label: string; categoryId: string | null;
  typicalAmount: number;   // median of the MOST RECENT 3 occurrences
  amountMad: number;       // MAD over the full window
  typicalDay: number; dayMad: number;
  occurrences: number; distinctMonths: number; lastSeen: string;
  confidence: number;      // 0..1
}
export function detectRecurring(
  transactions: Transaction[], maps: Maps, monthKey: string,
  opts?: { lookbackMonths?: number; today?: Date },
): RecurringCharge[];
```

Lookback **6 completed months** ending at `prevMonthKey(monthKey)`. Qualification — all must hold:

- `distinctMonths >= 3` — three *separate* months. This is the criterion that matters most; raw
  occurrence count lets a burst of five grocery runs masquerade as recurring.
- `occurrences >= 3` **and** `occurrences <= distinctMonths * 1.5` — excludes a daily coffee shop.
- **Amount stability `amountMad / median <= 0.25`**, using median + MAD rather than mean + stdev: one
  3× outlier (an annual charge, a double rent payment) blows up stdev and silently disqualifies a
  genuinely fixed cost. Disqualify if `median === 0`.
- **Date stability `dayMad <= 4`.** Rent on the 1st vs the 3rd is one charge; a subscription on the
  5th vs the 25th is not.
- `kind === "expense"` and `!excluded`, measured via **`effectiveExpense(tx)`** — not
  `Math.abs(tx.amount)` — or a 50/50-split restaurant bill looks like an unstable recurring charge.

`confidence = monthCoverage × amountStability × dayStability`, each clamped to [0,1]. Gates whether a
not-yet-landed charge enters the projection (`>= 0.5`) and greys out weak UI rows.

**Price changes:** stability is computed over the full window, but `typicalAmount` is the median of
the **most recent 3** occurrences — so rent going 12 500 → 13 200 still qualifies (`mad/median ≈
0.03`) *and* forecasts at the new price. A 30% hike correctly disqualifies until 3 months settle.

Income recurrence (salary) is a real future want — note it, don't build it.

### B2. Per-category forecast

```ts
export type ForecastVerdict = "on-track" | "trending-over" | "no-basis" | "settled";

export interface CategoryForecast {
  category: Category;
  landed: number; recurringLanded: number; recurringExpected: number;
  recurringLate: RecurringCharge[];
  variableLanded: number; variablePace: number; variableProjected: number;
  projected: number;
  baseline: number | null; vsBaselinePct: number | null;
  dailyAllowance: number | null;
  verdict: ForecastVerdict; isProjected: boolean;
}
export function categoryForecasts(
  transactions: Transaction[], maps: Maps, categories: Category[], key: string,
  opts?: { today?: Date; recurring?: RecurringCharge[]; budgets?: Budget[]; historyMonths?: number },
): CategoryForecast[];
export function monthForecast(/* same args */): CategoryForecast;  // the "All" pseudo-category
```

**The core fix:**

```
variablePace      = variableLanded / daysElapsed
variableProjected = variablePace * daysLeft          // NOT * daysInMonth
projected         = landed + recurringExpected + variableProjected
```

Extrapolating **only the variable part, only over the remaining days**, added to what already landed.
Rent sits in `recurringLanded`, is never extrapolated, and is counted exactly once.

Matching a landed transaction to a charge: `recurringKey(tx.description) === charge.key` **and**
`|effectiveExpense(tx) − typicalAmount| <= max(3*amountMad, 0.15*typicalAmount)` — the amount guard
stops a one-off 4 000 kr shop being credited as a recurring 500 kr charge.

**Baseline** = *median* of `categorySpendInMonth` (`selectors.ts:154`, reuse verbatim) over the last
3 **completed** months. Drop zero months only if the category has spend in ≥2 of them.

**Early-month history blend, corrected.** Keep `budgetForecasts`' insight but apply it to the
variable component only:

```
w                = daysLeft / daysInMonth
variableBaseline = baseline - typicalRecurringForCategory
variableProjected = w * (variableBaseline * daysLeft / daysInMonth)
                  + (1 - w) * (variablePace * daysLeft)
```

Today's `budgetForecasts` (`selectors.ts:338`) blends the *whole* projection against the *whole*
historical average, double-counting fixed costs at both ends. Splitting fixed from variable first is
what makes the blend valid.

**Verdicts:** `no-basis` — no history and `daysElapsed < 7` → show "too early to say", *not a
number*. `settled` — ≥90% recurring → "fixed — 12 500 kr, no action needed", `dailyAllowance = null`
(rent must never say "you can spend 400/day on rent"). `trending-over` — `projected > max(baseline,
budgetLimit) * 1.05`. `on-track` otherwise.

**The daily allowance — the meaningful number:**

```
target         = budgetLimit ?? baseline
remaining      = target - landed - recurringExpected
dailyAllowance = daysLeft > 0 ? max(0, remaining / daysLeft) : null
```

*"You've spent 3 200 on food, rent and el are paid, 890 of subscriptions are still coming — that
leaves **410/day for the remaining 11 days** to land where you normally do."* Meaningful precisely
because `recurringExpected` is subtracted.

**Edge cases:** a **late** recurring charge (typical day 1, today the 5th, unseen) **stays in
`recurringExpected`** and surfaces via `recurringLate` → "Rent (usually the 1st) hasn't landed yet";
dropping it makes the forecast quietly optimistic, the worst failure mode. Only drop at
`daysLeft === 0`. Past months: `isProjected = false`, `projected = landed`, guarded via
`monthProgress(key, today).isCurrentMonth`.

**Pre-existing bug to fix here:** `monthProgress` (`selectors.ts:131`) sets `daysElapsed =
daysInMonth` for any non-current month, so a **future** month reports fully elapsed. Harmless today;
nonsense the moment the month switcher lands on next month with a forecast widget on screen. Add
`isFutureMonth` to `MonthProgress` and set `daysElapsed = 0`.

### B3. Rewire

**`budgetForecasts` becomes a thin adapter over the new engine** — two forecasters that disagree is
worse than one that's wrong. It keeps its exact exported signature and `BudgetForecast` shape, so
`budgets/page.tsx` needs **zero edits**; internally it maps each budget's category through
`categoryForecasts`. Its tests in `selectors.test.ts` are the regression net — **expect several
numeric expectations to move**, which is the point: they were wrong for rent-heavy categories.

`computeDashboard` (`compute.ts:31`) — replace `avgPerDay`/`projected` with `monthForecast`. Keep the
`avgPerDay` key (`registry.tsx:102` reads it) but change its meaning to `dailyAllowance`; add
`fixedLanded` / `variableLanded` / `recurringExpected`.

| Widget | Change |
|---|---|
| `total` | "Projected" uses the new projection; "Daily pace" becomes **"kr/day left"** with `"${daysLeft} days left"`; new sub-line `"12 500 fixed · 4 200 variable"` |
| **`forecast` (NEW)** | **"Where you'll land, per category."** Top 6 by projected spend; each row: name · projected vs baseline · verdict pill · daily allowance. The literal answer to the ask |
| **`fixedVsVariable` (NEW, small)** | One stacked bar: fixed landed / variable landed / still expected / headroom |
| `budgets` | Shape unchanged, now backed by the corrected `budgetForecasts` |

Because C3 removed persisted layout, registering a widget is just adding it to the fixed array in
`page.tsx` plus `widgets`/`widgetTitles` — **no migration needed**.

### B4. Tests

Co-located `recurring.test.ts`, `category-forecast.test.ts`, `normalize.test.ts`, with a local
`makeTx()` in the style of `mock.ts:78`. Required fixtures:

1. **Rent on day 1** — 6 months of `HYRA <month>` at −12 500 on the 1st. Asserts the key collapses
   the month suffix, `dayMad = 0`, and **on day 3 `projected ≈ 12 500 + small variable`, not
   12 500 × 10**. This is the headline regression test.
2. **Mid-month subscription** — Spotify −119 on the 15th, today the 10th → lands in
   `recurringExpected`, and `dailyAllowance` already has it deducted.
3. **No history** — new category, two charges → `baseline === null`, `no-basis` on day 4, not on
   day 20, absent from `detectRecurring`.
4. **Late charge** — rent history on the 1st, today the 6th, unpaid → in `recurringLate` and
   `recurringExpected`; **re-running with the charge present yields the same `projected`** (no
   double-count).
5. **Price change** — 12 500 ×4 then 13 200 ×2 → still qualifies, `typicalAmount === 13 200`.
6. **Split transaction** — recurring charge with a 50/50 split → `typicalAmount` is the `mine` half.
7. **Noise** — 15 varying grocery charges over 2 months → rejected by both the `distinctMonths` and
   MAD gates.
8. **Past month** — `isProjected === false`, `projected === landed`, `dailyAllowance === null`.

---

# Track A — RAG categorization with learning

### A0. Extract, no behaviour change

`matchesOwnAccount` → `src/lib/domain/own-account.ts` (it's account identity, not categorization —
and it survives the purge). `reconcileKindWithSign` → `src/lib/ai/reconcile.ts` (unit-testable
without mocking the DB). `needsReview` → `src/lib/domain/review.ts`. Existing suite must pass
unchanged.

### A1. Schema

**Extend `categorization_examples` rather than adding a table.** A second table forces a sync problem
(which row does curation edit? how do corrections flow log→corpus?) for no benefit at single-owner
scale. The table changes character from *append-only log* → *curated corpus*.

```ts
export type ExampleStatus = "candidate" | "approved" | "rejected";
export type ExampleSource = "import" | "detail" | "manual" | "backfill";
export const EMBED_DIMS = 1536;

// added to the existing table:
dedupKey:       text("dedup_key").notNull().default(""),        // normalizeMerchant(cleanedDescription)
finalTagIds:    jsonb("final_tag_ids").$type<string[]>().notNull().default([]),
status:         text("status").$type<ExampleStatus>().notNull().default("candidate"),
gold:           boolean("gold").notNull().default(false),
hitCount:       integer("hit_count").notNull().default(1),
lastSeenAt:     text("last_seen_at").notNull().default(""),
embedding:      vector("embedding", { dimensions: EMBED_DIMS }),  // nullable by design
embeddingModel: text("embedding_model"),
// indexes:
uniqueIndex("catex_user_dedup_idx").on(t.userId, t.dedupKey),     // required for onConflictDoUpdate
index("catex_user_status_idx").on(t.userId, t.status),
index("catex_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
```

Plus a new `evalRuns` table: `{ id, userId, createdAt, chatModel, embeddingModel, promptVersion,
corpusSize, goldSize, metrics: jsonb, mistakes: jsonb }`.

Every new NOT NULL column carries `.default(...)` — deliberate, so `drizzle-kit push` can
`ADD COLUMN` in place without prompting or rewriting.

**pgvector extension.** `drizzle-kit push` emits `vector(1536)` and `CREATE INDEX … USING hnsw`, both
of which fail without the extension, and push never emits `CREATE EXTENSION`. There's no `drizzle/`
dir, so a migration file isn't an option without changing the whole workflow. Smallest fix — a
preflight chained into the existing script, mirroring `seed.ts` (`import "./env"` first):

```ts
// src/lib/db/extensions.ts
export async function ensureExtensions() { await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`); }
// package.json
"db:ensure-ext": "tsx src/lib/db/ensure-extensions.ts",
"db:push": "npm run db:ensure-ext && drizzle-kit push"
```

Idempotent, in-repo (a fresh Neon branch just works), no superuser needed.

**Dimensions: 1536** (`text-embedding-3-small` native). ~6 KB/row; a 3 000-row corpus is ~18 MB.
pgvector's HNSW cap is 2 000 dims. Note the HNSW index is **useless below ~10k rows** — the planner
will seqscan. Declare it for the future; don't rely on it now.

Verified against drizzle-orm 0.45.2: `vector(name, { dimensions })`, `cosineDistance`, and
`index().using("hnsw", …)` all exist.

### A2. Embeddings

`text-embedding-3-small`. One pure function used **identically** on the document and query sides —
asymmetry here silently destroys recall, so it lives in one place:

```ts
// src/lib/ai/normalize.ts
export function normalizeMerchant(cleanedDescription: string): string;
export const dedupKeyFor = normalizeMerchant;
export const embedTextFor = normalizeMerchant;
```

- **Cleaned, not raw** — raw fragments the same merchant across dates.
- **Do NOT embed the amount.** A merchant string is ~4 tokens; appending `"~1 000 kr out"` makes the
  amount ~60% of token mass and clusters the space by magnitude instead of merchant. Amount is a
  **re-rank bonus** in A3 instead.
- **Do NOT embed the category name.** Queries have no category (asymmetry), and it would make every
  label edit invalidate the embedding. As designed the embedding depends **only** on the description,
  so `dedupKey` and `embedding` are 1:1 and re-labelling never triggers a re-embed. This is what
  makes the write path cheap.

```ts
// src/lib/ai/embed.ts — never throws; null per input where the batch failed
export async function embedMany(texts: string[]): Promise<(number[] | null)[]>;
```

Chunk at 256 inputs, `Promise.allSettled`. Three generation paths sharing one code path:
write-time fire-and-forget; **lazy self-heal at retrieval time** (`WHERE embedding IS NULL AND status
<> 'rejected' LIMIT 512` → one embed → one batched UPDATE) — the load-bearing one, which makes
write-time failure a non-event; and backfill (A6), which is the lazy loop run to completion.

Cost for a 200-row import: ~1 embed call, ~400 tokens, **$0.00001, 150–300 ms** — free relative to
the 5 chat calls (~$0.003, 3–8 s). Don't optimize it. On failure nulls propagate and retrieval falls
back to the lexical leg; **the lexical leg must never depend on embeddings** — that's the entire
degradation story.

### A3. Retrieval — hybrid, one round-trip

200 separate `ORDER BY embedding <=> $1` queries is out of the question on the HTTP driver. Two moves:

1. **Dedupe query texts.** 200 rows ≈ 80 distinct `dedupKey`s. Retrieve once per key, fan back.
2. **One statement per chunk** via `CROSS JOIN LATERAL` over a VALUES list of query vectors:

```sql
SELECT q.idx, e.id, e.cleaned_description, e.final_kind, e.final_category_id,
       e.final_tag_ids, e.hit_count, 1 - (e.embedding <=> q.v) AS sim
FROM (VALUES (0, $1::vector), (1, $2::vector), …) AS q(idx, v)
CROSS JOIN LATERAL (
  SELECT * FROM categorization_examples
  WHERE user_id = $u AND gold = false AND embedding IS NOT NULL AND status = ANY($statuses)
  ORDER BY embedding <=> q.v LIMIT 8
) e
```

Chunk the VALUES list at 40 vectors, send all chunks as **one `db.batch([…])` = one HTTP
round-trip**. Build it parameterized, never string-concatenated:
`sql.join(vecs.map((v,i) => sql\`(${i}, ${JSON.stringify(v)}::vector)\`), sql\`, \`)`.
Drizzle 0.45's `cosineDistance` covers the single-vector case; the LATERAL form needs the `sql`
template because the builder can't express it.

**Lexical leg — reuse, don't rewrite.** Ship the corpus *without* the embedding column
(~100 B/row → 200 KB at 2 000 rows) and build an in-memory inverted index over `merchantTokens`
(`src/lib/ai/select-examples.ts:10`, used verbatim). Score = Jaccard overlap, ties broken by
`hitCount desc` then `lastSeenAt desc`, top 8. `selectExamples` itself is deleted — it's a
batch-level selector and this design is per-row; `merchantTokens` is the durable part.

**Fusion** (`src/lib/ai/fuse.ts`, pure): reciprocal rank fusion,
`score(d) = Σ_l w_l / (60 + rank_l(d))`; then the amount re-rank bonus that replaces embedding the
amount — `score *= 1 + 0.10 * sameMagnitude(qAmount, cAmount)` where `sameMagnitude =
|log10(|a|/|b|)| < 0.5`; then `diversify` by category + merchant-root, cap **k = 6**. Weights and k
are module constants so A8's eval can sweep them.

**Gold exclusion lives in one shared predicate builder** used by *every* retrieval path
(`corpusFilter(userId, opts)` in `src/lib/db/corpus-queries.ts`). Centralizing is the point — a
forgotten `gold = false` silently inflates every eval number, and that bug class is invisible.
Honest note: excluding the gold *row* doesn't stop near-duplicate non-gold rows of the same merchant
being retrieved. That leak is unfixable and must be **reported**, not prevented — see A8.

Round-trip budget for a 200-row import: **3 DB round-trips, 1 embed call, 5 chat calls.**

### A4. Prompt + output

**Preserving the cached prefix is the important part.** OpenAI prompt caching is exact-prefix,
≥1024 tokens. Today the few-shot lives *inside* the system string (`categorize-openai.ts:49`), so the
system message's tail already varies per batch; per-row neighbours would make it worse.

- **`system` (message 0) — 100% stable per user.** Task instructions + kind definitions + the priors
  block (A10) + full category list (`id = name`) + full **tag taxonomy** + output contract. Nothing
  retrieval-dependent. ~900–1 100 tokens — comfortably over the caching threshold, and exactly the
  block worth caching. Changes only when a category or tag is added/renamed.
- **`user` (message 1) — volatile.** Evidence table, then rows.

Cache key `cat:${userId}:${taxonomyVersion}` where `taxonomyVersion = stableHash(sorted category
ids+names ‖ tag ids+names ‖ PROMPT_VERSION)`.

**Rendering neighbours without a token explosion.** Naive (6 neighbours × 40 rows = 240 lines,
~3 600 tokens) is unaffordable and mostly redundant. Instead **one deduplicated evidence table per
chunk, referenced by row**:

```
CONFIRMED EXAMPLES — the user approved these. Prefer them over your own prior when a row resembles one.
E1  ica maxi haninge → expense · Groceries · []
E2  spotify ab       → expense · Entertainment · [Subscription]
E3  hyra             → expense · Rent · [Fixed cost]

ROWS TO CLASSIFY — index | amount | description | closest confirmed examples
0 | -487   | ICA NÄRA VASASTAN | E1, E9
1 | -119   | SPOTIFY AB        | E2
2 | -12500 | HYRA APRIL        | E3
```

Neighbour sets overlap heavily, so a 40-row chunk unions to 40–80 distinct examples (~900 tokens) plus
~10 tokens/row of pointers. **Per-row precision fully preserved at sub-linear token cost** — the
single most important token decision here. When the approved corpus is thin (A10), render candidates
in a second block labelled `UNCONFIRMED EXAMPLES — treat as weaker evidence.`

**Output schema:** `{ index, kind, categoryId, tagIds, confidence }` — `tagIds` replaces the unused
optional `addTagIds` (one consumer, `import-modal.tsx:170`). Keep `categoryId` as
`["string","null"]` rather than a dynamic enum; the existing post-filter
(`validIds.has`, `categorize-openai.ts:145`) handles hallucinated ids and is proven. Add the identical
post-filter for `tagIds`.

**Set `temperature: 0`.** It is currently unset, so it defaults to 1 — every categorization run is
sampling. A latent bug independent of this project, and the cheapest stability win available.

**Confidence** — defined in the cached prompt ("≥0.9 if a CONFIRMED EXAMPLE matches this merchant;
≤0.6 if inferring from the name alone; ≤0.4 if the description is opaque"), then clamped server-side
using retrieval evidence, the one calibration signal we control:

```ts
// src/lib/ai/confidence.ts — pure
export function clampConfidence(modelConfidence, ev, chosenCategoryId): number;
// neighbourCount === 0                                  → min(c, 0.6)   → forces needsReview
// topLexicalOverlap >= 0.8 && chosen === topNeighbour   → max(c, 0.95)
```

This makes the review queue track *"the system has never seen this before"* — what actually matters —
with no calibration machinery. It's also load-bearing for cold start (A10).

### A5. Feedback capture

One API replaces the three loggers:

```ts
// src/app/actions/corpus.ts
export async function recordExamples(rows: ExampleInput[], source: ExampleSource): Promise<void>;
```
`ExampleInput` = the existing `CorrectionInput` fields **plus `predictedTagIds` and `finalTagIds`**.

Six capture sites: `import-modal.tsx:285`; `transaction-detail.tsx:94` (category), `:132` (approve),
`:172` (kind); **`transaction-detail.tsx:154` `<TagEditor onChange>` — the missing hook, tags are
never logged today**; and the `/training` manual-entry form. Debounce the TagEditor wrapper 400 ms
(a 3-tag edit fires 3 times; upserts make it idempotent, just chatty).

**Auto-approval policy**, implemented as two distinct `onConflictDoUpdate` `set` clauses:

| Source | First insert | Repeat (dedupKey hit) |
|---|---|---|
| `detail` (correction *or* explicit approval) | `approved` | labels overwritten, `status → approved`, `hitCount++` |
| `manual` | `approved` | same |
| `backfill` from `categorySource === "user"` | `approved` | `hitCount = GREATEST(hitCount, n)` |
| `import`, predicted **==** final (passive keep) | `candidate` | **`hitCount`/`lastSeenAt` only — labels and status untouched** |
| `import`, predicted **!=** final (edited in modal) | `approved` | labels overwritten, `status → approved` |
| `recategorize` | **never written** | — |

Two invariants: **`rejected` is sticky** (otherwise every import re-floods the queue with merchants
already dismissed) and **`approved` never downgrades**. `recategorize` never writing is deliberate —
it's the model reading its own output back as ground truth, i.e. feedback-loop poisoning.

**Flooding solved at three levels:** write (`uniqueIndex(userId, dedupKey)` — 40 corrections become
one row with `hitCount = 40`, which also fixes unbounded growth and the PII surface flagged in
`BACKLOG.md`), retrieval (`diversify` caps one per merchant-root/category), prompt (shared evidence
table). `hitCount` becomes load-bearing: lexical tie-break, curation sort ("most-seen unreviewed
first" = highest leverage per minute), corpus-health stat.

**Latent bug to fix here:** `transaction-detail.tsx:98,177` passes `predictedKind: tx.kind` — the
*current* kind, not the prediction, so `corrected` is unreliable for kind changes. Don't add a
column; redefine `corrected = finalCategoryId !== predictedCategoryId || source === "detail"`.

### A6. Backfill (must land before A7)

```ts
// src/lib/corpus/backfill.ts
export function planCorpusBackfill(transactions, legacyExamples, opts): BackfillPlan;  // pure
export async function runCorpusBackfill(userId, opts): Promise<{ processed; remaining; embedded }>;
```

Sources: (1) **transactions with `categorySource === "user"`** → `approved`, **including
`finalTagIds = tx.tagIds`** — months of hand-verified labels *with tags* the system has never learned
from, the highest-value source by far; (2) existing `categorization_examples` rows → compute
`dedupKey`, collapse groups, `hitCount = group size`, `status = (corrected || source === 'detail') ?
'approved' : 'candidate'`, `finalTagIds = []`; (3) **opt-in, off by default**: high-confidence model
labels → `candidate`.

Runs both as `npm run corpus:backfill` (tsx, mirroring `seed.ts`) for the initial run with visible
output, and as a paged server action (500/page, returns `{ processed, remaining }`) behind a
`/training` button — the app runs on Vercel and a local `DATABASE_URL` may not be to hand.

**Idempotency:** the unique index plus a backfill-specific `onConflictDoUpdate` setting
`hitCount = GREATEST(hitCount, $n)` rather than incrementing, never downgrading `status`. Re-running
is a **true no-op**. A naive `hitCount++` would inflate counts every run and quietly corrupt the
curation sort.

### A7. Delete rules

`src/lib/rules.ts` + test, `src/lib/categorize.ts` + test, `src/components/rules/*`,
`src/app/(app)/rules/`, the `categorization_rules` table, `previewRuleBackfill`/`applyRuleBackfill`,
`Dataset.rules`, the four `apply*Rule*` reducers in `dataset-mutations.ts`, the rule queries in
`queries.ts`, `CLAIMABLE_TABLES`, and the seed rules at `mock.ts:63-71`. Second `db:push`, run
**on its own** so the drop statement is unambiguous.

**A6 must have run first** — deleting rules against an empty corpus is the cold-start worst case
in production.

### A8. Eval harness

Gold = deterministic 20% by stable hash (`fnv1a-32`, no `Math.random`), **materialized into the
`gold` column at insert** then user-toggleable — hash default gives determinism, persistence gives
control.

Measured by running the real categorization path with `gold = false` in the retrieval predicate:
`kindAccuracy`; `categoryAccuracy` (exact); **`categoryAccuracyRoot`** (via `rootCategoryId`,
`selectors.ts:53` — confusing *Restaurants* with *Café* is a rounding error, *Food* with *Housing* is
a real failure; two numbers that diverge tell you which problem you have); micro-averaged
`tagPrecision/Recall/F1`; `meanConfidenceCorrect` vs `meanConfidenceWrong` (a calibration smell test
— if equal, the review queue is random); and **`reviewPrecision`** (of rows flagged `needsReview`,
what share were actually wrong) — the number that decides whether the queue is worth your minutes.

**The seen/unseen split is not optional.** For each gold example, `seen = ∃ approved non-gold row
with `merchantTokens` overlap ≥ 0.6`. **Report every metric three ways — overall / seen / unseen,
with counts.** A gold example whose merchant appears 30× is a *lookup*, not a prediction. 95% overall
that decomposes into 99% seen / 55% unseen means the system memorizes and cannot generalize — and
**unseen is what predicts how the next import will feel**, so make `unseen categoryAccuracy` the
headline. Guard: if `unseenCount < 30`, render "not enough unseen examples to be meaningful" rather
than a percentage.

Runs as `npm run eval` (no cap, the loop you iterate prompts in) and as a server action capped at 200
gold rows behind a button. Results to `evalRuns`; `mistakes` (capped at 100) powers a "worst
mistakes" list. Scoring is **pure and injected** (`evaluate(gold, predictions, seenFlags, maps)`), so
it's unit-tested with a fake predictor and no network.

### A9. `/training` page

Replaces `/rules`. Sections top to bottom:

1. **Accuracy panel** — headline unseen category accuracy, kind accuracy, tag F1; secondary
   seen/overall with `n`; corpus counts (approved/candidate/rejected/gold); "Run evaluation" +
   last-run timestamp; collapsible worst-mistakes deep-linking into the corpus.
2. **Candidate queue** — unreviewed rows sorted `hitCount desc` (highest leverage first). Per row:
   description, amount, "seen 12×", inline category `Select` + `TagEditor`, Approve / Reject /
   Edit-and-approve. Keyboard `a`/`r`/`j`/`k` — it's a queue, it must be fast or it won't get used.
3. **Approved corpus** — search (client-side via `merchantTokens`, so it behaves like retrieval),
   inline-edit category + tags, delete, gold toggle.
4. **Add example** — description · amount · kind · category · tags → `recordExamples([…], "manual")`.
5. **Re-categorize existing** (A10) and **Backfill corpus** (A6), the latter surfaced prominently
   when the corpus is empty.

**Do not put the corpus in `['dataset']`** — `getDataset` (`queries.ts:17`) is on the critical path of
every page load; a few thousand corpus rows would tax the whole app for one page. Use a sibling
`src/store/corpus.ts` with key `['corpus']`, reusing the same `run(mutate, persist)`
optimistic-with-rollback helper.

Nav: swap the `rules` entry in `nav-items.ts` for
`{ key: "training", href: "/training", label: "Training", icon: GraduationCap }`. **Because C3
removed persisted nav config, that's the only change** — no migration, no `mergeNavConfig`.

### A10. Cold start — the real risk in this design

With rules, the keyword table, and the seed rules all deleted and a corpus that starts empty,
**the only thing between you and a bad first import is the system prompt.** Four-part mitigation;
none of it reintroduces a rules engine or a memory layer.

1. **Promote the deleted rules' *knowledge* into the stable system prompt as a priors block.** Not
   rules returning: it's domain instruction text inside the cached prefix (so nearly free after the
   first call), and the current prompt already half-does this (`categorize-openai.ts:37` names SEB
   Kort, Amex, Revolut, Avanza). Complete it: salary lines (`LÖN`, `LÖNEUTBET…`) → income; card-bill
   payments and top-ups (SEB Kort, Amex, Revolut, Avanza) → transfer; `lån`/`bolån`/`amortering` →
   Mortgage; and the common-merchant hints (ICA/Coop/Hemköp/Willys/Lidl → groceries, SL → transit,
   Apoteket → health, OKQ8/Circle K/Preem/St1 → fuel, Systembolaget → alcohol, Klarna → the
   underlying purchase, not a transfer). That last bullet is the deleted keyword table **rewritten as
   prose, which is strictly better than the code it replaces**: the LLM generalizes from "ICA" to
   *ICA Nära* / *ICA Kvantum*; `String.includes` never could. Phrase them as overridable: *"If a
   CONFIRMED EXAMPLE contradicts these hints, the example wins."*
2. **Backfill from your own history on day one (A6).** The empty-corpus state should last about
   thirty seconds. This is the actual fix; the priors are the floor.
3. **Let candidates participate at low weight while the approved corpus is thin.**
   `MIN_APPROVED_FOR_STRICT = 50`; below it, widen to `status <> 'rejected'` and render those in the
   `UNCONFIRMED EXAMPLES` block. Self-bootstrapping, and unverified data can never drown out verified
   data once 50 approvals exist.
4. **The confidence clamp closes the loop.** Zero-retrieval rows clamp to ≤0.6 → `needsReview` →
   surface in the queue → get corrected → enter the corpus as `approved`. Cold start solves itself
   through the review loop, *provided the queue is well-targeted* — which is what the clamp buys.

**Residual cost of the decision, stated plainly:** every transaction now costs an LLM call forever,
including SPOTIFY AB for the 40th time. Per-import cost and latency stay proportional to row count,
categorization can never run offline, and there's a small non-zero rate of the model flip-flopping on
a merchant it got right last month. Mitigations available *within* the decision: `temperature: 0`
(biggest single win, costs nothing), the ≥0.95 clamp on high-overlap agreement keeping settled
merchants out of the queue, and `hitCount`-weighted lexical ranking making an established merchant
reliably its own top neighbour.

### A11. Re-categorize existing transactions

New capability — the LLM only ever ran at import. Replaces the deleted rule-backfill actions, reusing
their preview→apply shape.

```ts
// src/app/actions/recategorize.ts
export type RecategorizeScope = "needs-review" | "uncategorized" | "month" | "all-model";
export async function previewRecategorize(scope, month?): Promise<{ changes; unchanged; truncated }>;
export async function applyRecategorize(changes: RecategorizeChange[]): Promise<number>;
```

`applyRecategorize` takes the **previewed** changes back rather than re-running the LLM — you apply
exactly what you saw, no drift, no second API spend. Never touches `categorySource === "user"` (the
same guard `planRuleBackfill` had). Preview capped at 300 rows. **Writes no corpus examples** (A5).

Client: one optimistic apply, one round-trip — add `applyBulkTransactionPatch` to
`dataset-mutations.ts` and `bulkUpsertTransactions` (via `db.batch`) to `queries.ts`, wired through
the existing `run()` helper. **Do not loop `updateTransaction`** (N server actions).

---

# Track D — Smart manual add

`src/components/nav/quick-add-modal.tsx`:

- **Debounced suggestion.** Once description and amount are present, call `categorizeTransactions([{
  index: 0, description, amount }])` (the existing server action already takes a single row) and
  prefill kind, category, and tags with a visible "Suggested" affordance and a one-tap dismiss.
- **On save:** if the suggestion was kept → `categorySource: "model"`, `predictedCategoryId`,
  `categoryConfidence`, `needsReview: needsReview(confidence)`, and `recordExamples([…], "manual")`
  as an approval. If edited → `categorySource: "user"` and `recordExamples` as a correction. Either
  way the manual path finally feeds the loop.
- **Allow `kind: "transfer"`** — the domain supports it, the form doesn't.
- **Fix the account default.** `useState(accounts[0]?.id ?? "")` is captured on first render and
  ignores `kind === "spending"` / `archived`. Derive it the way `import-modal.tsx:62` deliberately
  does.

---

# Verification

Run at the end of every phase — each is independently shippable:

```
npm test          # vitest run — 46 files; expect the count to move as suites are added/deleted
npm run lint      # eslint --max-warnings 0
npx tsc --noEmit
npm run build
npm run check:docs
```

**Schema changes:** run `npm run db:push` **interactively, one push per phase** (C1, A1, A7), reading
the statement list before confirming. Never batch a drop with an unrelated add.

**Track B** — the eight fixtures in B4 are the gate; fixture 1 (rent on day 1) is the headline
regression test. Then manually: open `/` on a rent-heavy month and confirm the projection is no
longer ~10× reality, and that `/budgets` still renders (its adapter keeps the signature).

**Track A** — beyond unit tests, three checks that only work end to end:
1. **Prompt-cache invariant:** a test asserting `messages[0].content` is **byte-identical across two
   different neighbour sets**. This silently regresses and costs money for months before anyone
   notices.
2. **Real import:** run a real CSV through `/import` after A4 and measure wall-clock and token spend
   against the pre-change baseline. A3 ships in **shadow mode** (retrieval computed and logged, not
   used) precisely so this is de-risked before it's on the critical path.
3. **`npm run eval` before and after A7** (the rules deletion). This is the whole reason A8 exists:
   without it, "did removing rules help?" is unanswerable. Land A8 before any prompt tuning or you'll
   be tuning blind.

**`vitest.setup.ts` needs updating in both C1 and A5** — the `@/app/actions/*` mocks must match the
real export surface, and a new `vi.mock("@/app/actions/corpus")` is required, or component tests fail
at import with the `neon()` DATABASE_URL throw. Easy to miss; will bite on the first `/training` test.

# Key risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | `db:push` fails on `vector`/`hnsw` — no extension | `db:ensure-ext` preflight chained into `db:push` (A1) |
| R2 | Per-row retrieval destroys prompt caching | Evidence lives strictly outside `system`; byte-identity test guards it (A4) |
| R3 | Per-row neighbours explode tokens 4× | Shared deduplicated evidence table with per-row pointers (A4) |
| R4 | 200 vector queries on the HTTP driver | Dedupe query texts + `CROSS JOIN LATERAL` + one `db.batch` (A3) |
| R5 | **Cold start** with rules *and* keyword fallback deleted | Priors block in the cached prefix + day-one backfill + candidates-when-thin + confidence clamp (A10). **A6 before A7** |
| R6 | Re-categorization poisons the corpus with model output | `recategorize` never writes examples — enforced by omitting it from the write path (A5/A11) |
| R7 | Eval becomes a vanity metric | Seen/unseen split as headline, `n < 30` suppression, root-vs-exact accuracy, review precision (A8) |
| R8 | Embeddings outage breaks import | `embedMany` never throws; lexical leg independent; lazy self-heal next run (A2) |
| R9 | Model flip-flops on settled merchants | `temperature: 0` (currently unset — latent bug), ≥0.95 clamp, `hitCount` tie-break (A10) |
| R10 | Two forecasters drift apart | `budgetForecasts` becomes an adapter over the new engine; no parallel math (B3) |
| R11 | Ambiguous merchant collapses to one corpus label | Documented limitation; `/training` "split entry" as a follow-up (see Context) |
| R12 | `monthProgress` treats a future month as fully elapsed | Add `isFutureMonth`, `daysElapsed = 0` (B2) |
