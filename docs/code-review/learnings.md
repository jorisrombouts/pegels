# Code-review learnings

A record of what the adversarial review process got **wrong**, so the next iteration starts from
better hypotheses instead of repeating the same mistakes.

Process: review passes generate findings → one fresh-context subagent per finding tries to **refute**
it → survivors become GitHub issues. This file records the refutations, because a rejected hypothesis
is the more reusable artifact: it tells you which reasoning shortcut to distrust.

**Round 1** — 2026-08-06. 20 findings → 7 issues (#2–#8), 6 rejected, 4 re-run after an interruption.
Yardstick: ~10k transactions, single user. Bar: real *and* meaningfully impactful.

**Round 3 — implementation** — 2026-08-06/07. All 12 issues (#2–#13) fixed, one subagent per issue in
its own worktree, each gated on lint + tests + `check:docs` + build before merge. Every filed fix
survived contact with the code; what did *not* survive was the accuracy of the numbers attached to
them. See "Round 3" below.

---

## Rejected findings, and why

### R1 · "The whole dataset is re-serialized to localStorage on every mutation"
**Hypothesis:** `createSyncStoragePersister` synchronously `JSON.stringify`s ~3MB on every
`setQueryData`, stalling the main thread on the app's most common interaction, and nearing the 5MB
localStorage quota.

**Why it was wrong:**
- The persister's default `throttleTime` is 1000ms and it **coalesces** — 20 rapid calls over 200ms
  produced exactly **one** `setItem`. I assumed throttling *delays* each write rather than collapsing
  them.
- Measured blocking: **5.8ms desktop / 15.6ms at 4× / 23.3ms at 6× CPU throttle** — and it fires from
  a trailing timer a full second *after* the tap, long after the optimistic update has painted. It
  never lands in the interaction's response window.
- The quota is **10MiB**, not 5MB. I also compared UTF-8 megabytes against a UTF-16 limit. The real
  payload is ~60% of quota with headroom to ~16–17k transactions.

**Kept:** the `QuotaExceededError` path genuinely does fail silently (`src/lib/query.ts` passes no
`retry`, and `persistQueryClientSave` is a floating promise). Latent, not currently reachable.

**Lesson:** read the library's throttle/batching semantics from source before costing a "per-event"
claim. And check *when* work runs relative to the interaction, not just how long it takes.

### R2 · "`useUI()` without a selector re-renders every transaction row"
**Hypothesis:** four call sites subscribe to the whole Zustand store, so opening any modal re-renders
the transactions page and all its rows.

**Why it was wrong:** the *mechanism* was right — Zustand v5 uses an identity selector and `Object.is`
on the whole state object, and `set()` always reallocates. But the *consequence* was not. Every prop
`TransactionRow` receives is referentially stable on a modal toggle (`filtered` is `useMemo`'d over
TanStack-stable slices, `onSelect` is `useCallback`'d), so **`React.memo` bails out on all of them**.
Measured 0.023ms for 300 rows. I never traced the memo boundary.

Also: the list is month-scoped, so it is ~300–400 rows at 10k transactions, not 10k.

**Lesson:** "component re-renders" ≠ "work happens". Trace prop identity through every memo boundary
before claiming render cost. Establish the realistic N for the actual view, not the dataset size.

### R3 · "`categorizeTransactions` over-fetches the entire dataset"
**Hypothesis:** it calls `getDataset()` and never reads `data.transactions`, adding latency to the
import hot path.

**Why it was wrong:** the fact is exactly true, but ~2.0MiB raw compresses to **~290KiB** on the wire
(drizzle's neon-http uses array-mode rows; undici always sends `accept-encoding`), costing ~80–250ms
— immediately in front of a **5–15 second** parallel `gpt-4o-mini` call on the same path. That is
1–3% of the interaction.

**Lesson:** always express a latency claim as a **fraction of the dominant cost on the same path**.
An 80ms waste in front of a 10s call is not a performance finding.

### R4 · "`date-fns` is an unused dependency worth removing"
**Hypothesis:** unused, 37MB installed, costing install time, CI time, lockfile size, audit surface.

**Why it was wrong:** it *is* 100% unreferenced and direct-only — but two of the four cost vectors do
not exist here. **There is no `.github/` directory at all**, so "CI time" is fictional. And the
package has zero dependencies and zero install scripts, so the audit-surface argument is negligible.
It never reaches the bundle. What remains is a one-line chore.

**Also refuted:** `rootCategoryId` is not dead — a checked-in design spec under
`docs/superpowers/specs/` explicitly plans to consume it. `PopoverAnchor` is zero-cost shadcn
upstream boilerplate; deleting it makes future `shadcn add` diffs noisier.

**Lesson:** verify the cost model's *infrastructure actually exists* before invoking it. And grep
`docs/` and specs for **planned** usage before calling anything dead.

### R5 · "`applyRemoveTag` rebuilds every row; `recent` sorts 10k with `localeCompare`; dead params"
**Hypothesis:** three cheap wins in hot data paths.

**Why it was wrong:**
- TanStack's `replaceEqualDeep` structural sharing already preserves identity for the 8,443 unchanged
  rows. The "every row re-renders" claim measured **false**. Real cost ~4ms, on an action a user
  performs maybe once a year.
- `localeCompare` is only **19% slower** than `<`/`>` on 10k ISO strings (1.45ms vs 1.17ms) — V8
  caches the collator and fast-paths ASCII. "Dramatically slower" was wrong. The win is in dropping
  the *sort*, not the comparator, and it is 9% of a 16.7ms block.
- The dead params are real (and there are **four**, not one — `tsc --noUnusedParameters` finds them)
  but cost nothing at runtime.

**Lesson:** weight every finding by **trigger frequency**. Per-keystroke ≫ per-session ≫ per-year.
And benchmark the "obviously slow" primitive before calling it slow.

### R6 · "`categorization_rules.created_at` is write-only dead data"
**Hypothesis:** stamped on every write, never read, and reset on edit so it cannot mean "created".

**Why it was wrong:** every fact verified true. It failed on **remediation risk**: removing it means
dropping a `NOT NULL` column from a live Neon database with no migration files (drizzle push
workflow), plus churn in `map.ts` and the inferred row type — more risk than the dead weight removed.

**Lesson:** the cost of the *fix* counts against the finding, not just the size of the defect.

### R7 · "The import review step recomputes everything on every keystroke"
**Hypothesis:** the derived-state block in `import-modal.tsx` has no `useMemo` anywhere, so every
keystroke rebuilds a 10k-entry Set, sorts 2,000 rows, and makes ~10 more full passes.

**Why it was wrong:** all the facts held — no `useMemo` in 557 lines, typing genuinely re-renders the
whole component, the Set genuinely is built twice. But measured in a real browser with a production
React build, the entire block costs **1.47ms**, and **A/B testing the exact proposed fix produced zero
improvement** (764ms vs 754ms baseline).

The killer control: running with **`transactions = 0`** — where the 10k-row Set does not exist at all
— measured *identically* to `transactions = 10000`. The centrepiece of the hypothesis was invisible.

Real cost model: **≈3ms + 0.55ms × (visible rows)**. The cost is re-rendering each visible row (four
controlled inputs + two Radix `Select` subtrees each, no `memo`, no virtualization), not the
arithmetic. The derived block is ~5% of a steady-state keystroke and ~0.2% of the worst case.

**Lesson — the strongest one in this file:** when you believe cost X drives latency, **run the control
that removes X entirely**. If latency is unchanged, the hypothesis is dead regardless of how sound the
reasoning looked. Reason about *proportion of measured total*, never about absolute operation counts.

**Also:** "there is no `useMemo` here" is an observation, not a finding. Unmemoized cheap work is fine.

### R8 · "There is no error boundary anywhere, so any throw takes down the screen"
**Hypothesis:** no **error**, **global-error**, or **not-found** route file exists, and no React
boundary, while `requireUserId` throws from inside every server action.

**Why it was wrong:** Next 16.2.6 **ships a default global error boundary**, wired at build time
(in next-app-loader, pointing at Next's builtin global-error component, which app-router installs as
the final fallback). It renders a styled, theme-aware page with Reload/Back and an error digest.
`/_not-found` is auto-generated too.

Verified empirically, not by argument: a production build with instrumented throw routes showed a
server-component throw → 500 + styled page; a client render throw → styled page with Reload+Back; and
critically, **an uncaught server-action throw leaves the page fully intact**, logging to console only.

Every listed throw site was already handled: `AppLayout` calls `redirect("/signin")` *before*
`requireUserId` can throw, and both `fetchRatesToSEK` call sites have designed fallbacks with a retry
button.

**Lesson:** **the absence of a file is not the absence of the behaviour.** Frameworks ship defaults.
Before filing "X is missing", establish what happens without X — in a *production* build, empirically.
Note the docs did NOT state this default; it took reading framework source. When docs are silent,
that is not evidence of absence.

**Useful byproduct:** if an **error** route file is ever added, it must live at the app root, not in
the `(app)` segment — per the Next docs, an error file does not wrap the layout in its own segment, so
a segment-level one would not catch an `AppLayout` throw.

---

### R9 · "`detectTransfersOnImport` is O(new x existing) with a `Date` alloc per comparison"
**Hypothesis:** 2,000 x 10,000 = 20M predicate evaluations, each allocating two `Date`s, costing
~2.8s. The 2.8s came from another verifier's incidental measurement.

**Why it was wrong — two independent failures:**

1. **The inherited measurement came from a degenerate dataset.** Reproducing it required every
   existing row at `+100` and every new row at `-100` — 100% amount collision. That dataset yields
   2,878ms and 40M `Date` allocations. **Realistic personal-finance data costs 326ms** with 20,050
   allocations. The originating agent had unknowingly benchmarked a rigged distribution.
2. **The mechanical claim was wrong by ~2000x.** The `&&` short-circuit puts `days()` *fifth*, behind
   an exact negated-amount match and an account-differs check. Instrumented on realistic data:
   19,870,838 predicate evaluations, but only **20,050** `days()` calls — 0.1%. Cross-sign collisions
   are structurally rare (a new expense must exactly negate an existing income).

It also runs **sequentially after** the LLM call (`categorizeTransactions` at import-modal.tsx:149,
detection at :180), making it 2-6% of the step — structurally identical to R3, which was already in
this file when the hypothesis was written.

**Lessons:**
- **Re-derive an inherited measurement on data you generated yourself.** A number handed over by
  another agent carries its dataset's assumptions invisibly. Benchmark realism is part of the claim.
- **Read short-circuit order before costing a predicate.** "N comparisons x cost-of-worst-branch" is
  wrong whenever a cheap test guards the expensive one.
- The fix being cheap and provably safe (43-184x, byte-identical output across 9 scenarios) does not
  rescue an immaterial cost. Verified separately: the bucketing fix preserves first-match-wins.

**Recorded for later:** growth is genuinely O(new x existing) — 2,000 x 25,000 reaches 1,285ms. If the
table grows that far *and* the LLM leg is ever cached or removed, revisit.

---

### R10 · "Import motion via LazyMotion + `m` across 11 modules"
**Hypothesis:** every site imports the full `motion` component for simple opacity/`y` animations;
`LazyMotion` + `domAnimation` would cut the bundle.

**Why it was wrong:** measured, the refactor saves ~12.6 KiB gz on three routes but **adds 26.9 KiB gz
to the sign-in and not-found routes**, because the feature bundle lands in the root-layout chunk and
those routes use no motion at all. Isolated properly, the narrower feature set is **6.8 KB net *worse*
over a full 9-route session** — it reshuffles chunk boundaries and reduces sharing on later routes.

**Lesson:** a bundle "fix" can be net negative. Measure **per route and across a whole session**, not
just on the one page you were looking at. Chunking is a global optimisation; local improvements can
regress it. Also: placement matters as much as the change — the same wrapper at the root layout
regressed sign-in by 42 KiB, while scoping it to the `(app)` subtree was a large win.

---

## The value of "considered and NOT filed"

Round 1's pass 3 noticed **four chunks of exactly 136,638 bytes with differing content**, could not
establish whether that was real duplication, and explicitly recorded it as *not filed — an unverified
hunch does not clear the bar*.

It was real, and it turned out to be the **largest bundle finding of the review** (issue #12):
the four chunks own an identical set of 15 module factories differing only in emission order, so they
get different hashes and different URLs and defeat HTTP caching. **132.5 KiB gz of redundant copies —
29.9% of the whole client-JS budget.** The fix touches two files and no call sites.

**Lesson:** record anomalies you cannot prove, with what would settle them. Do not file them — a hunch
is not a finding — but do not discard them either. The written-down anomaly is what let a later,
better-equipped pass go straight to the answer.

---

## Partially-wrong findings (right defect, wrong mechanism)

Worth its own category — these are the most dangerous, because the issue gets filed and the wrong
explanation ships with it.

**"SSR prefetch is entirely wasted behind HydrationGate"** → filed as #9, but the headline was wrong.
`HydrationBoundary` sits **outside** `HydrationGate`, so the dehydrated payload *does* reach the
client and *does* seed the query cache — verified by instrumenting `loadDataset` and confirming no
follow-up fetch on a cold visit. The data is used.

The real defect is narrower: the layout `await`s with no Suspense boundary above it, so no HTML byte
flushes until the query resolves, and the route's **loading** file provably cannot cover it (Next
docs: a loading file does not wrap the layout in the same segment). Measured TTFB 496ms → 4ms at a
realistic 450ms query.

**Lesson:** verify the *mechanism*, not just the symptom. "The work is wasted" and "the work blocks"
are different defects with different fixes; only the second was real. Trace where a value is actually
consumed before claiming it is discarded.

---

## What the surviving findings had in common

Useful as a template for generating round-2 hypotheses:

1. **A large measured multiplier** — #5: 170 full array traversals per render, 1.7M row visits.
2. **Silent failure** — #8 fails at ~2,900 rows with the rows appearing then vanishing; #3 leaves a
   backfill half-applied with no rollback and no pending UI.
3. **Deviation from a stated invariant** — #2 is the 1 of 32 server actions without an auth gate.
4. **A defect in a shared primitive** — #7 is one unnamed button multiplied across 13 modals.
5. **Contrast with correct code nearby** — #4's `removeTag` does in N statements what `removeCategory`
   five lines above does in one.

Findings that failed were almost all "this code is wasteful in the abstract" without a measured
multiplier, a frequency argument, or a failure mode.

---

## Round 2

Seeds that died **before** costing a subagent, by applying the heuristics above — the payoff of
keeping this file:

- **`ai.ts` sequences `await getDataset()` before `Promise.all([...])`.** Killed by R3: it sits in
  front of the same 5–15s LLM call. Same mistake, caught by the heuristic.
- **Four dead parameters in `selectors.ts`.** Already rejected as R5; zero runtime cost.
- **`applyRuleBackfill` idempotency.** Already written into issue #3 as both root cause and fix — a
  duplicate, not a finding.

Verified in round 2: silent async failures, missing error boundaries, `src/app/(app)/budgets/page.tsx`
memoization, motion bundle + per-route chunk duplication, import row-render cost, and
`detectTransfersOnImport` complexity.

## Seeds for the next iteration

Concrete leads surfaced *by the verifiers* while refuting round 1 — each still needs a hypothesis and
its own adversarial check:

- **`src/app/(app)/budgets/page.tsx` has no memoization at all.** `buildMaps` + `budgetForecasts` measured **1.59ms**
  and re-run on every render including purely local `setSelectedId`. Same root cause family as #5.
- **`applyRuleBackfill` is not idempotent.** `planRuleBackfill` sets `categoryId`/`kind`
  unconditionally without comparing to the current value (the `tagIds` branch *does* guard), so
  re-running emits all ~4,200 writes again. Cost never amortises.
- **`ai.ts` sequences `await getDataset()` before `Promise.all([affirmed, recent])`** — two sequential
  network phases where one would do.
- **No accessibility assertions anywhere.** Zero `axe` or `toHaveAccessibleName` usage across
  `src/**/*.test.tsx`, despite the suite querying by accessible name heavily. #7 would have been
  caught by a test.
- **`createSyncStoragePersister` is `@deprecated`** upstream in favour of the async persister — a
  maintenance signal, and it would also fix R1's silent-quota-failure path.
- **`noUnusedParameters` is off.** Turning it on surfaces four dead params in `selectors.ts` alone.

**Status after round 3.** Shipped: the budgets memoization (#10) and the backfill idempotency guard,
which was folded into #3 as its highest-leverage part — it takes a steady-state backfill from ~4,223
writes to zero, which is worth more than batching those writes. Partly done: the accessibility gap —
#7 added one `getByRole` name assertion, but there is still no `axe` pass and no systematic coverage.
Still open: the sequential `await` in the AI path (killed once by R3, so it needs a frequency argument
rather than a fresh statement of the same fact), the deprecated sync storage persister, and
`noUnusedParameters`.

Two new leads surfaced *by the implementation*, neither of which any round-1 or round-2 pass caught,
both found while measuring rather than reading:

- **`main`'s schema and the live database have diverged.** `src/lib/db/schema.ts` declares a `goals`
  table, a `goal_id` column on transactions, and a `user_preferences` table; none exist in the
  deployed database. The reads fail and `prefetchQuery` swallows it. This is a production defect, not
  a performance one, and it was invisible to every static pass because the code is internally
  consistent — only a live query exposes it.
- **The service worker re-requests the document on install** (`caches.add`), causing a second
  server-side dataset query per cold load. Noticed as measurement noise while verifying #9's
  hydration behaviour, then controlled for rather than investigated.

## Round 3 — what implementing all 12 issues taught

### Every filed number was optimistic. Every single one.

The findings were right; their magnitudes were not. Each fix was re-measured by the agent
implementing it, and in **four out of four** cases the real win was smaller than the issue claimed:

| issue | filed claim | measured | why it shrank |
| --- | --- | --- | --- |
| #12 motion bundle | −66,705 B gz / session | −63,753 B | method difference, ~4% |
| #9 streaming layout | TTFB 496 → 4 ms | 202 → 34 ms | issue assumed a 449 ms query; the real one is 121 ms |
| #5 selectors | 15–18x | 8.2x | filed prototype included a per-row cache the simplified fix drops |
| #10 budgets memo | 97–99% of the tap | 60–88% | Profiler artifact (below) |

Note the causes are all different — this is not one bad harness. Two are measurement artifacts, one
is an inherited assumption never re-derived, and one is a prototype that quietly did more than the
fix it justified.

**Lesson:** a filed number is an *upper bound*, not an estimate. Re-measure at implementation time
and publish the delta. None of these invalidated a fix; all of them would have embarrassed a
release note.

### The Profiler artifact is confirmed, and it has a recognisable signature

Round 2 suspected it; round 3 proved it. React zeroes `Profiler` timings against production builds.
The measured post-fix React floor was **0.9–1.0 ms**, roughly 10x the "0.0–0.1 ms" the harness
reported.

**Distrust any claim shaped like "React render is ~0 ms, therefore X is ~100% of the cost."** That
conclusion is what the bug manufactures. Two replacements that worked:

- Time the computation directly (#5) rather than inferring it from a render attribution.
- Bracket **start-of-dispatching-task → start-of-next-macrotask** via `MessageChannel`, asserting the
  DOM committed inside the window (#10). React 19 does *not* flush a discrete click synchronously
  inside `dispatchEvent`; it schedules a microtask, so bracketing the dispatch measures nothing.

### A filed fix can be wrong, not merely over-scoped

#5's proposed fix included: *"move `.slice(0, maxCategories)` before the per-category point
computation."* This is impossible — the slice ranks by `sum`, and `sum` is derived from the very
points it would skip. Reordering them changes which categories get selected.

**Lesson:** review the fix text as adversarially as the finding. A finding is a claim about code
that exists; a fix is a claim about code that doesn't, so nothing has tested it.

### Simplifying a fix costs measurable performance, and that is usually the right trade

#5's filed plan wanted a new indexing module, a five-field per-row derived cache, and dual selector
signatures. The rewritten plan was an ~8-line private helper threaded through two call sites. That
cost **~9x → ~8x** and bought: no new module, no dual call path, no signature change, and **zero
existing tests modified** — which is what made "behaviour-preserving" checkable rather than asserted.

The strongest evidence produced anywhere in this round came from that constraint: an identical
fingerprint hash over every output field, before and after.

### Tooling traps specific to parallel agents in worktrees

- **Git's stash stack is shared across all worktrees** — it lives in the common git directory, not
  per-worktree. Two agents stashed concurrently and each popped the other's work. Both recovered it,
  but only because they noticed. **Use patch files** (`git diff > file`, `git apply -R`, `git apply`)
  for baseline comparisons; never `git stash` when agents run in parallel.
- **A symlinked `node_modules` inherits the *host checkout's* branch**, not the worktree's. Every
  worktree based on `main` failed to build because the host sat on a branch that had uninstalled
  three dependencies `main` still imports. Diagnosed identically by five agents, which is the good
  outcome — they refused to write it off and proved it with a clean comparison.
- **Husky hooks silently do not run in worktrees.** `core.hooksPath` points at a generated directory
  that is not committed, so git skips the hook without complaint. Do not treat the pre-commit gate as
  enforced there; run its commands explicitly.

### Deployment checks lie in three distinct ways

- **Absence of `.github/workflows` is not absence of CI.** Vercel attaches as a GitHub App, so a
  workflow-file search reports "no CI" while a real required check exists. Query the checks API.
- **Preview and Production are separate environment scopes.** Preview deploys had failed on *every*
  PR in the repo's history — including ones predating this review — purely because `DATABASE_URL` was
  never scoped to Preview. Production was unaffected and green throughout.
- **A green deployment proves the build, not the app.** This is the one that mattered: production
  deployed green while `getDataset` could not read its own database, because `src/lib/db/schema.ts`
  on `main` declares tables and columns the live schema no longer has. `dehydrateDataset` uses
  `prefetchQuery`, which never throws, so the failure is swallowed and an **empty cache** is
  dehydrated. Green build, broken app, no signal anywhere.

### Measure against the real encoder, not a plausible stand-in

For #8 the question was how many rows fit in a Server Action body. `JSON.stringify` is the obvious
proxy; the actual limiter counts what React's `encodeReply` produces. Measuring with the real encoder
gave 354.3 bytes/row against 316.2 for the naive method on one CSV shape — a 12% error, right where
the 1 MB cliff is. It independently reproduced the issue's ~2,900-row failure point.

---

## Process notes

- **Anchor issues to symbols, not line numbers.** A concurrent session refactored mid-review and every
  line reference drifted. Cite function names and let the reader search.
- **Run verifiers against a clean `git worktree`**, never the live working directory — another session
  may be editing it.
- **Constrain what security findings may publish.** On a public repo, a verifier will otherwise write
  a full exposure analysis into the issue body. Specify "problem and fix only" up front.
- **The same applies to measurements.** An agent benchmarking against a real environment will put the
  numbers it derived — row counts, payload sizes, query latencies — straight into a public PR body.
  Decide up front whether production-derived figures may be published.
- **Tell agents which database `.env.local` points at.** Worktrees symlink it for builds, so "local"
  silently means "production". Read-only measurement is fine; briefs that say "verify against the
  real action" invite writes. Say *read-only*, explicitly, and say what to do instead.
- **Verify a check belongs to the current commit.** After a force-push, `gh pr checks` will report the
  previous commit's result as though it were current. Compare the rollup against the PR's head SHA
  before merging, or you will merge on a check that never ran.
- **Ask for the control that would refute the fix.** The regression tests that earned their place were
  the ones shown red before the change and green after; a test that passes either way proves nothing,
  and several agents caught their own vacuous assertions this way.
- **Sequence work that shares a file.** Two issues both wanted row-chunking in the same module. Run
  serially and the second reuses the first's helper; run in parallel and you get two.
