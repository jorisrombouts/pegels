# Transaction Roles, Transaction-Driven Goals & Hidden Income — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the implicit `ignored`/`savings` logic with an explicit transaction `kind` (expense / income / transfer), make savings transfers credit goals (transaction-driven goal progress), auto-detect transfer pairs on import, and hide income everywhere.

**Architecture:** A single `kind` field on `Transaction` is the source of truth: `effectiveExpense` counts only expenses; transfers count toward neither and may carry a `goalId`; income is never displayed or counted. Goals derive `saved` from linked transfers + a baseline (the manual `contributions[]` log is removed). The app keeps its current shape — pure selectors over arrays, the `useData` TanStack-Query facade, Neon/Drizzle behind server actions.

**Tech Stack:** Next.js 16, React 19, TypeScript, Drizzle ORM + Neon Postgres, TanStack Query, Zustand (UI store), Vitest + Testing Library.

Spec: `docs/superpowers/specs/2026-05-29-transaction-roles-design.md`. Run all commands from the repo root. Build green + `npm test` green after every task.

---

## File structure (what changes and why)

- `src/lib/domain/types.ts` — add `TransactionKind`, `kind`, `goalId`; remove `ignored`, `GoalContribution`, `Goal.contributions`.
- `src/lib/domain/effectiveExpense.ts` — `effectiveExpense`/`includedNet` become `kind`-driven.
- `src/lib/domain/selectors.ts` — add `goalSaved`; `goalProgress` takes transactions; add `detectTransferPairs`; income excluded from any income/net display helpers.
- `src/data/mock.ts` — `t()` factory defaults `kind` by sign; explicit kinds for salary/transfers; convert goal `contributions` into transfer transactions.
- `src/lib/db/schema.ts`, `map.ts`, `queries.ts`, `src/app/actions/data.ts`, `src/store/dataset-mutations.ts`, `src/store/data.ts` — propagate `kind`/`goalId`, drop `ignored`/`contributions`.
- `src/components/transactions/transaction-detail.tsx` — Type control + goal picker (replaces Exclude switch).
- `src/app/(app)/transactions/page.tsx` — hide income rows; "Net" → "Spent"; transfer row styling.
- `src/components/transactions/transaction-row.tsx` — transfer styling, no income.
- `src/components/dashboard/registry.tsx` + `compute.ts` — remove Income stat.
- `src/components/goals/goal-editor.tsx`, `src/app/(app)/goals/page.tsx` — drop manual contributions; show linked transfers.
- `src/components/import/import-modal.tsx` — call `detectTransferPairs` after parsing.
- Tests alongside each.

---

# Phase 1 — `kind` model + transfers

### Task 1: Add `kind` + `goalId` to the domain type (keep build green)

**Files:**
- Modify: `src/lib/domain/types.ts`
- Modify: `src/data/mock.ts` (the `t()` factory + salary/transfer rows)
- Modify: `src/lib/domain/selectors.test.ts` (the `tx()` factory), and any other test `tx()`/transaction literal factories so they set `kind`.

- [ ] **Step 1: Add the type.** In `src/lib/domain/types.ts`, above `Transaction`:

```ts
export type CategorySource = "model" | "user";
export type TransactionKind = "expense" | "income" | "transfer";
```

Add these two fields to the `Transaction` interface (keep `ignored` for now — removed in Task 4):

```ts
  /** What this money event is. Drives counting + visibility. */
  kind: TransactionKind;
  /** Goal this transfer funds (only when kind === "transfer"). */
  goalId: string | null;
```

- [ ] **Step 2: Default `kind` in the mock factory.** In `src/data/mock.ts`, the `t(date, description, amount, categoryId?, overrides?)` factory builds a `Transaction`. Add to its returned object, before applying overrides:

```ts
    kind: amount < 0 ? "expense" : "income",
    goalId: null,
```

Then set explicit kinds on the non-expense seed rows via their overrides:
- Salary rows ("Lön Företaget AB", +38500): add `{ kind: "income" }`.
- The two "Överföring till/från Sparkonto" rows and any Revolut top-up transfer: add `{ kind: "transfer" }` (and drop their `ignored: true`).

- [ ] **Step 3: Default `kind` in test factories.** In `src/lib/domain/selectors.test.ts` the `tx()` helper returns a `Transaction`; add `kind: o.amount != null && o.amount < 0 ? "expense" : "expense"` — simpler: add `kind: "expense", goalId: null,` to the defaults object (tests pass negative amounts as expenses). Do the same for any transaction literal in other test files flagged by the type-checker (e.g. `transaction-row.test.tsx`, `split-editor.test.tsx`, `transaction-detail.test.tsx`): add `kind: "expense", goalId: null`.

- [ ] **Step 4: Verify compile + tests.**

Run: `npm run build 2>&1 | grep -iE "error|finished typescript"` then `npm test`
Expected: build "Finished TypeScript" with no error; tests still pass (133).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/domain/types.ts src/data/mock.ts src/lib/domain/*.test.ts src/components/**/*.test.tsx
git commit -m "feat(domain): add transaction kind + goalId fields"
```

### Task 2: Make `effectiveExpense`/`includedNet` kind-driven

**Files:**
- Test: `src/lib/domain/effectiveExpense.test.ts`
- Modify: `src/lib/domain/effectiveExpense.ts`

- [ ] **Step 1: Write/extend failing tests.** In `effectiveExpense.test.ts` add:

```ts
it("counts only expense-kind transactions", () => {
  const base = { id: "t", date: "2025-03-01", description: "x", accountId: "a", categoryId: null, predictedCategoryId: null, categoryConfidence: null, categorySource: "user" as const, needsReview: false, tagIds: [], goalId: null };
  const acc = { id: "a", name: "A", type: "Checking", kind: "spending" as const, icon: "", color: "", balance: 0, archived: false };
  expect(effectiveExpense({ ...base, amount: -100, kind: "expense" }, acc)).toBe(100);
  expect(effectiveExpense({ ...base, amount: -100, kind: "transfer" }, acc)).toBe(0);
  expect(effectiveExpense({ ...base, amount: 100, kind: "income" }, acc)).toBe(0);
});

it("counts only the mine portion of a split expense", () => {
  const base = { id: "t", date: "2025-03-01", description: "x", accountId: "a", categoryId: null, predictedCategoryId: null, categoryConfidence: null, categorySource: "user" as const, needsReview: false, tagIds: [], goalId: null, kind: "expense" as const };
  const acc = { id: "a", name: "A", type: "Checking", kind: "spending" as const, icon: "", color: "", balance: 0, archived: false };
  expect(effectiveExpense({ ...base, amount: -1000, splits: [{ id: "s1", amount: 500, mine: true }, { id: "s2", amount: 500, mine: false }] }, acc)).toBe(500);
});
```

- [ ] **Step 2: Run, expect fail.** Run: `npx vitest run src/lib/domain/effectiveExpense.test.ts` → FAIL (transfer/income still counted, or type errors).

- [ ] **Step 3: Rewrite the functions.** Replace the bodies in `effectiveExpense.ts`:

```ts
export function effectiveExpense(tx: Transaction, _account?: Account): number {
  if (tx.kind !== "expense") return 0; // income & transfers never count as spend
  if (tx.amount >= 0) return 0;
  if (tx.splits && tx.splits.length > 0) {
    return tx.splits.reduce((sum, s) => (s.mine ? sum + Math.abs(s.amount) : sum), 0);
  }
  return Math.abs(tx.amount);
}

export function includedNet(tx: Transaction): number {
  if (tx.kind !== "expense") return 0; // only expenses contribute to month spend/net now
  if (tx.splits && tx.splits.length > 0) {
    return -tx.splits.reduce((s, x) => (x.mine ? s + Math.abs(x.amount) : s), 0);
  }
  return tx.amount;
}
```

Update the doc comment to describe the kind rule. The `account` param is now unused but kept for call-site compatibility (prefix `_`).

- [ ] **Step 4: Run all tests.** Run: `npm test` → PASS (update any `effectiveExpense`/`monthNet` test expectations that assumed savings-account exemption or `ignored`; savings movements are now `kind: "transfer"` so they still return 0).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/domain/effectiveExpense.ts src/lib/domain/effectiveExpense.test.ts
git commit -m "feat(domain): drive effectiveExpense/includedNet off transaction kind"
```

### Task 3: Detail-panel Type control (replaces Exclude switch)

**Files:**
- Modify: `src/components/transactions/transaction-detail.tsx`
- Test: `src/components/transactions/transaction-detail.test.tsx`

- [ ] **Step 1: Write failing test.** Add to `transaction-detail.test.tsx`:

```ts
it("shows a Type control and a goal picker when Transfer is chosen", async () => {
  const user = userEvent.setup();
  renderWithData(<TransactionDetail txId="tx-001" />);
  expect(screen.getByText("Type")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Transfer" }));
  expect(screen.getByText(/Counts toward goal/i)).toBeInTheDocument();
});
```

(Add `import userEvent from "@testing-library/user-event";` if missing.)

- [ ] **Step 2: Run, expect fail.** Run: `npx vitest run src/components/transactions/transaction-detail.test.tsx` → FAIL.

- [ ] **Step 3: Implement.** In `transaction-detail.tsx`:
  - Pull `goals` from the store: `const { transactions, categories, accounts, goals, updateTransaction } = useData();`
  - Replace `const isIncome = tx.amount > 0 && !tx.ignored;` with `const isIncome = tx.kind === "income";` and replace `tx.ignored` usages in the headline block with `tx.kind === "transfer"` (the dimmed/struck treatment now means "transfer", with an appropriate pill label e.g. "Transfer").
  - Replace the entire **Exclude** block (the `glass-inset` switch) with a segmented **Type** control and an optional goal picker:

```tsx
      {/* Type */}
      <div className="space-y-2">
        <Label>Type</Label>
        <div className="flex overflow-hidden rounded-xl glass-inset p-1">
          {(["expense", "income", "transfer"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => updateTransaction(tx.id, { kind: k, goalId: k === "transfer" ? tx.goalId : null })}
              className={cn(
                "pressable flex-1 rounded-lg px-3 py-1.5 text-sm font-medium capitalize",
                tx.kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {k}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Transfers move money between your own accounts — they don&apos;t count as spending or income.
        </p>
      </div>

      {tx.kind === "transfer" && (
        <div className="space-y-1.5">
          <Label>Counts toward goal (optional)</Label>
          <Select value={tx.goalId ?? ""} onValueChange={(v) => updateTransaction(tx.id, { goalId: v || null })}>
            <SelectTrigger>
              <SelectValue placeholder="No goal" />
            </SelectTrigger>
            <SelectContent>
              {goals.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.icon} {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
```

  Note the `Select` here needs a way to clear to "No goal"; if `ui/select` can't emit empty, add a leading `<SelectItem value="">No goal</SelectItem>` and treat `""` as null in the handler (already done via `v || null`).

- [ ] **Step 4: Run tests.** Run: `npm test` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/components/transactions/transaction-detail.tsx src/components/transactions/transaction-detail.test.tsx
git commit -m "feat(transactions): replace Exclude switch with Type + goal control"
```

### Task 4: Remove `ignored` everywhere it remains

**Files:** grep first: `git grep -n "ignored" src/` — update each non-test + test occurrence.

- [ ] **Step 1: Find usages.** Run: `git grep -n "\bignored\b" src/`
- [ ] **Step 2: Remove the field.** In `src/lib/domain/types.ts` delete the `ignored: boolean` line. Remove the `ignored` default from `mock.ts` `t()` and any remaining `ignored` overrides (already converted to `kind` in Task 1). Remove `kind: "expense", ... ignored` leftovers in tests. The detail panel no longer references `ignored` (Task 3). Search `recent-activity.tsx`, `transaction-row.tsx`, `calendar`/selectors for `ignored` and replace any "excluded" visual condition with `tx.kind === "transfer"` (transfers are the visible-but-uncounted rows now).
- [ ] **Step 3: Build + test.** Run: `npm run build 2>&1 | grep -iE "error"` (none) then `npm test` (green). Fix every reported reference.
- [ ] **Step 4: Commit.**

```bash
git add -A
git commit -m "refactor(domain): remove ignored flag (superseded by kind=transfer)"
```

### Task 5: Drizzle schema — `kind` + `goal_id`, drop `ignored`

**Files:**
- Modify: `src/lib/db/schema.ts`, `src/lib/db/map.ts`
- Test: `src/lib/db/map.test.ts`

- [ ] **Step 1: Update schema.** In `schema.ts` `transactions` table: add
  `kind: text("kind").$type<TransactionKind>().notNull(),`
  `goalId: text("goal_id"),`
  and remove `ignored`. Import `TransactionKind` type from `../domain/types`.

- [ ] **Step 2: Update mappers + test.** In `map.ts` add `kind` and `goalId` to both `rowToTransaction` (pass through; `goalId: r.goalId`) and `transactionToRow` (`kind: t.kind, goalId: t.goalId`); remove `ignored`. Extend `map.test.ts` round-trip transaction to include `kind: "transfer", goalId: "goal-x"` and assert it survives.

- [ ] **Step 3: Run mapper tests.** Run: `npx vitest run src/lib/db/map.test.ts` → PASS.

- [ ] **Step 4: Push schema + reseed.** Run: `npm run db:push` then `npm run db:seed`. Expected: "Changes applied" and the seed summary line.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/db/schema.ts src/lib/db/map.ts src/lib/db/map.test.ts
git commit -m "feat(db): transactions.kind + goal_id, drop ignored"
```

### Task 6: Auto-detect transfer pairs (selector + import wiring)

**Files:**
- Modify: `src/lib/domain/selectors.ts`
- Test: `src/lib/domain/selectors.test.ts`
- Modify: `src/components/import/import-modal.tsx`

- [ ] **Step 1: Write failing test** in `selectors.test.ts`:

```ts
describe("detectTransferPairs", () => {
  const accs = [
    { id: "seb", kind: "spending" as const }, { id: "rev", kind: "spending" as const }, { id: "spar", kind: "savings" as const },
  ];
  const goals = [{ id: "g-japan", accountId: "spar" }];
  const mk = (id: string, accountId: string, amount: number, date: string) => ({ id, accountId, amount, date, kind: amount < 0 ? "expense" : "income", goalId: null });

  it("pairs an outflow and matching inflow across accounts within 3 days as transfers", () => {
    const rows = [mk("a", "seb", -5000, "2025-03-10"), mk("b", "rev", 5000, "2025-03-11")];
    const out = detectTransferPairs(rows as never, accs as never, goals as never);
    expect(out.find((r) => r.id === "a")!.kind).toBe("transfer");
    expect(out.find((r) => r.id === "b")!.kind).toBe("transfer");
  });

  it("sets goalId on the outflow when destination is a goal's savings account", () => {
    const rows = [mk("a", "seb", -3000, "2025-03-10"), mk("b", "spar", 3000, "2025-03-10")];
    const out = detectTransferPairs(rows as never, accs as never, goals as never);
    expect(out.find((r) => r.id === "a")!.goalId).toBe("g-japan");
  });

  it("leaves an unmatched inflow as income", () => {
    const rows = [mk("b", "rev", 5000, "2025-03-11")];
    const out = detectTransferPairs(rows as never, accs as never, goals as never);
    expect(out[0].kind).toBe("income");
  });
});
```

- [ ] **Step 2: Run, expect fail.** Run: `npx vitest run src/lib/domain/selectors.test.ts -t detectTransferPairs` → FAIL.

- [ ] **Step 3: Implement** in `selectors.ts`:

```ts
const TRANSFER_DAY_WINDOW = 3;

/**
 * Pair an outflow (−X) with a matching inflow (+X) on a DIFFERENT account within
 * TRANSFER_DAY_WINDOW days and mark both as transfers. If the inflow lands in a
 * savings account that backs a goal, link the outflow to that goal. Pure; returns a new array.
 */
export function detectTransferPairs(
  rows: Transaction[],
  accounts: Pick<Account, "id" | "kind">[],
  goals: Pick<Goal, "id" | "accountId">[],
): Transaction[] {
  const out = rows.map((r) => ({ ...r }));
  const goalByAccount = new Map(goals.filter((g) => g.accountId).map((g) => [g.accountId as string, g.id]));
  const used = new Set<number>();
  const days = (a: string, b: string) => Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);

  out.forEach((o, i) => {
    if (used.has(i) || o.amount >= 0) return; // start from outflows
    const j = out.findIndex((c, k) =>
      !used.has(k) && k !== i && c.amount === -o.amount && c.accountId !== o.accountId && days(c.date, o.date) <= TRANSFER_DAY_WINDOW,
    );
    if (j === -1) return;
    used.add(i); used.add(j);
    o.kind = "transfer";
    out[j].kind = "transfer";
    const dest = out[j].accountId;
    const goalId = goalByAccount.get(dest);
    if (goalId) o.goalId = goalId;
  });
  return out;
}
```

- [ ] **Step 4: Wire into import.** In `import-modal.tsx`, after parsing rows into transactions and before showing the review step, run the parsed rows through `detectTransferPairs(rows, accounts, goals)` (pull `goals` from `useData`). The review table already lets the user edit/override; ensure a row's detected `kind`/`goalId` is carried into the `addTransactions` payload.

- [ ] **Step 5: Run tests.** Run: `npm test` → PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/domain/selectors.ts src/lib/domain/selectors.test.ts src/components/import/import-modal.tsx
git commit -m "feat(import): auto-detect transfer pairs and link savings goals"
```

---

# Phase 2 — Transaction-driven goals

### Task 7: `goalSaved` selector + `goalProgress` from transactions

**Files:**
- Modify: `src/lib/domain/types.ts` (remove `GoalContribution`, `Goal.contributions`)
- Modify: `src/lib/domain/selectors.ts`
- Test: `src/lib/domain/selectors.test.ts`

- [ ] **Step 1: Write failing test:**

```ts
describe("goalSaved / goalProgress", () => {
  const goal = { id: "g", name: "Japan", icon: "🗾", target: 25000, baseline: 6000, deadline: null, accountId: "spar" };
  const txs = [
    { id: "t1", goalId: "g", kind: "transfer", amount: -3000, date: "2025-03-14" },
    { id: "t2", goalId: "g", kind: "transfer", amount: 1000, date: "2025-04-02" },
    { id: "t3", goalId: null, kind: "expense", amount: -500, date: "2025-03-01" },
  ];
  it("sums baseline + |amount| of linked transfers", () => {
    expect(goalSaved(goal as never, txs as never)).toBe(6000 + 3000 + 1000);
  });
  it("goalProgress reports saved and pct from transactions", () => {
    const p = goalProgress(goal as never, txs as never, new Date("2025-05-01"));
    expect(p.saved).toBe(10000);
    expect(p.pct).toBeCloseTo(0.4);
  });
});
```

- [ ] **Step 2: Run, expect fail.** Run: `npx vitest run src/lib/domain/selectors.test.ts -t goalSaved` → FAIL.

- [ ] **Step 3: Implement.** In `types.ts` remove `GoalContribution` and the `contributions` field from `Goal`. In `selectors.ts`:

```ts
export function goalSaved(goal: Goal, transactions: Transaction[]): number {
  return transactions.reduce(
    (sum, t) => (t.goalId === goal.id ? sum + Math.abs(t.amount) : sum),
    goal.baseline,
  );
}
```

Change `goalProgress(goal, today)` → `goalProgress(goal, transactions, today)` and compute `saved` via `goalSaved(goal, transactions)` instead of `baseline + contributions`. Update its callers (`compute.ts` `goals: data.goals.map((g) => goalProgress(g, data.transactions, today))`, and the goals page).

- [ ] **Step 4: Run tests.** Run: `npm test` → fix callers; PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/domain/types.ts src/lib/domain/selectors.ts src/lib/domain/selectors.test.ts src/components/dashboard/compute.ts
git commit -m "feat(goals): derive goal saved from linked transfers"
```

### Task 8: Drop `contributions` from DB + seed conversion

**Files:** `src/lib/db/schema.ts`, `map.ts`, `src/data/mock.ts`

- [ ] **Step 1: Schema + mappers.** Remove the `contributions` jsonb column from `goals` in `schema.ts`; remove `contributions` from `rowToGoal`/`goalToRow` in `map.ts`.
- [ ] **Step 2: Seed conversion.** In `mock.ts`, delete the `contributions: [...]` arrays from the two goals. For each former contribution, add a transfer transaction into the goal's linked savings account, e.g.:

```ts
  t("2025-01-31", "Sparande Emergency Fund", -3000, null, { kind: "transfer", goalId: "goal-emergency", accountId: "acc-spar" }),
  // ...one per former contribution (gc1..gc5), dated as before, amount negative (outflow being saved)
```

(Keep `baseline` as-is.) Ensure `acc-spar` is the linked account and amounts match the old contribution totals so goal progress is unchanged.

- [ ] **Step 3: Push + reseed + test.** Run: `npm run db:push && npm run db:seed && npm test`. Expected: applied, seeded, green.
- [ ] **Step 4: Commit.**

```bash
git add src/lib/db/schema.ts src/lib/db/map.ts src/data/mock.ts
git commit -m "feat(db): drop goal contributions column; seed savings as transfers"
```

### Task 9: Goal editor + goals page use linked transfers

**Files:** `src/components/goals/goal-editor.tsx`, `src/app/(app)/goals/page.tsx`, tests.

- [ ] **Step 1: Update goal-editor test.** In `goal-editor.test.tsx` remove assertions about the manual "add contribution" UI; assert the editor still renders name/target/baseline and (for an existing goal) Delete. Keep `renderWithData`.
- [ ] **Step 2: Edit goal editor.** Remove the contribution add/remove UI and any `contributions` reads/writes. The editor now edits `name, icon, target, baseline, accountId, deadline` via `upsertGoal`. Saved-so-far display (if shown) reads `goalSaved(goal, transactions)` (pull `transactions` from `useData`).
- [ ] **Step 3: Goals page.** Where the page showed the manual contribution log, list the goal's **linked transfer transactions** instead: `transactions.filter((t) => t.goalId === goal.id)`, newest first, each showing date + amount. `goalProgress(goal, transactions, today)` drives the ring/bar.
- [ ] **Step 4: Test.** Run: `npm test` → PASS.
- [ ] **Step 5: Commit.**

```bash
git add src/components/goals/goal-editor.tsx "src/app/(app)/goals/page.tsx" src/components/goals/goal-editor.test.tsx
git commit -m "feat(goals): edit via linked transfers, drop manual contributions UI"
```

---

# Phase 3 — Hide income

### Task 10: Hide income rows in the Activity list; "Net" → "Spent"

**Files:** `src/app/(app)/transactions/page.tsx`, `src/components/transactions/transaction-row.tsx`, tests.

- [ ] **Step 1: Write failing test.** In `transactions/page` (or a focused test) assert an income transaction (`kind: "income"`) does not render. Minimal: render the page via `renderWithData` and `expect(screen.queryByText("Lön Företaget AB")).not.toBeInTheDocument();`.
- [ ] **Step 2: Run, expect fail.**
- [ ] **Step 3: Implement.** In `transactions/page.tsx`: filter the base list with `.filter((t) => t.kind !== "income")` before applying search/filters. Replace the month **"Net"** label + `monthNet`/`includedNet` value with **"Spent"** using `monthSpend(transactions, maps, month)`. In `transaction-row.tsx`, render `kind === "transfer"` rows with a neutral "Transfer"/"→ \<goal\>" treatment (not income-green); income rows never reach it.
- [ ] **Step 4: Test.** Run: `npm test` → PASS.
- [ ] **Step 5: Commit.**

```bash
git add "src/app/(app)/transactions/page.tsx" src/components/transactions/transaction-row.tsx src/components/transactions/*.test.tsx
git commit -m "feat(transactions): hide income rows; show Spent instead of Net"
```

### Task 11: Remove the dashboard Income stat

**Files:** `src/components/dashboard/registry.tsx`, `src/components/dashboard/compute.ts`, `registry.test.tsx`.

- [ ] **Step 1: Update test.** In `registry.test.tsx` remove/adjust any assertion expecting an "Income" stat; assert the no-budget hero fallback renders pace info (e.g. "Avg / day") and no "Income".
- [ ] **Step 2: Implement.** In `registry.tsx` `total` widget, replace the `Income` `HeroStat` (the no-budget branch) with a non-income stat — e.g. keep the two pace stats ("Avg / day" + "over N days") and drop Income entirely. In `compute.ts`, remove the now-unused `income`/`net` fields if nothing else reads them (grep first: `git grep -n "\.income\b\|\.net\b" src/`); leave them only if still referenced.
- [ ] **Step 3: Test + build.** Run: `npm test && npm run build 2>&1 | grep -iE error` → green, no error.
- [ ] **Step 4: Commit.**

```bash
git add src/components/dashboard/registry.tsx src/components/dashboard/compute.ts src/components/dashboard/registry.test.tsx
git commit -m "feat(dashboard): remove income stat"
```

### Task 12: Full verification

- [ ] **Step 1:** Run: `npm test` → all green.
- [ ] **Step 2:** Run: `npm run lint` → clean.
- [ ] **Step 3:** Run: `npm run build` → clean.
- [ ] **Step 4:** Run: `npm run db:push && npm run db:seed` → applied + seeded.
- [ ] **Step 5: Manual (browser, dev server).** Confirm: no income row or income figure anywhere; the transactions month shows "Spent"; marking a transfer stops it counting; marking a transfer's goal advances the goal; importing a `−X`/`+X` pair auto-marks both as transfer. Capture the console with the existing Playwright pattern to confirm no new warnings.
- [ ] **Step 6: Commit** any test-expectation fixups.

```bash
git add -A && git commit -m "test: finalize transaction-roles verification"
```

---

## Self-review notes

- **Spec coverage:** kind model (T1–T2,T5), detail Type+goal (T3), remove ignored (T4), auto-detect (T6), goalSaved/goalProgress (T7), DB+seed for goals (T8), goal UI (T9), hide income rows + Net→Spent (T10), dashboard income removal (T11), verification (T12). All spec sections mapped.
- **Type consistency:** `kind: TransactionKind`, `goalId: string | null`, `goalSaved(goal, transactions)`, `goalProgress(goal, transactions, today)`, `detectTransferPairs(rows, accounts, goals)` used consistently across tasks.
- **Build-green ordering:** `kind` added before logic switch (T1), `ignored` removed only after the Type control replaces its UI (T4 after T3), `contributions` removed after `goalSaved` replaces it (T8 after T7).
- **No placeholders:** bulk mock-row edits are specified by rule + example (sign-default + explicit kinds), not "TODO".
