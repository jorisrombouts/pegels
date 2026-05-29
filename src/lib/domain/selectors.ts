import { effectiveExpense, includedNet } from "./effectiveExpense";
import type { Account, Budget, Category, Goal, Transaction } from "./types";
import { monthKey } from "@/lib/format";

export interface Maps {
  categoryById: Map<string, Category>;
}

export function buildMaps(categories: Category[]): Maps {
  return {
    categoryById: new Map(categories.map((c) => [c.id, c])),
  };
}

/** Walk up to the top-level (parentless) category id. */
export function rootCategoryId(categoryId: string | null, categoryById: Map<string, Category>): string | null {
  let id = categoryId;
  let guard = 0;
  while (id && guard < 10) {
    const c = categoryById.get(id);
    if (!c || c.parentId === null) return id;
    id = c.parentId;
    guard += 1;
  }
  return id;
}

/** Category id is `target` or a descendant of it. */
export function isInCategory(categoryId: string | null, target: string, categoryById: Map<string, Category>): boolean {
  let id = categoryId;
  let guard = 0;
  while (id && guard < 10) {
    if (id === target) return true;
    const c = categoryById.get(id);
    if (!c) return false;
    id = c.parentId;
    guard += 1;
  }
  return false;
}

export function inMonth(tx: Transaction, key: string): boolean {
  return monthKey(tx.date) === key;
}

/** Net of *included* transactions in a month (PRD §6.2): excluded rows omitted. */
export function monthNet(transactions: Transaction[], key: string): number {
  return transactions.reduce((sum, tx) => (inMonth(tx, key) ? sum + includedNet(tx) : sum), 0);
}

export function prevMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return monthKey(d);
}

export function nextMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m, 1));
}

/** The most recent month (yyyy-mm) that has any transaction — the app's "current" month. */
export function latestDataMonth(transactions: Transaction[]): string | null {
  let max: string | null = null;
  for (const t of transactions) {
    const k = monthKey(t.date);
    if (!max || k > max) max = k;
  }
  return max;
}

export interface MonthProgress {
  daysInMonth: number;
  daysElapsed: number;
  daysLeft: number;
  isCurrentMonth: boolean;
}

/** Where a month sits relative to `today`: total days, days elapsed/left, and whether it's the live month. */
export function monthProgress(key: string, today = new Date()): MonthProgress {
  const [y, m] = key.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const isCurrentMonth = today.getFullYear() === y && today.getMonth() + 1 === m;
  const daysElapsed = isCurrentMonth ? today.getDate() : daysInMonth;
  const daysLeft = Math.max(daysInMonth - daysElapsed, 0);
  return { daysInMonth, daysElapsed, daysLeft, isCurrentMonth };
}

function accountMatches(tx: Transaction, accountFilter: string): boolean {
  return accountFilter === "all" || tx.accountId === accountFilter;
}

/** Total spending for a month (PRD §7.1 contract). */
export function monthSpend(
  transactions: Transaction[],
  maps: Maps,
  key: string,
  accountFilter = "all",
): number {
  return transactions.reduce((sum, tx) => {
    if (!inMonth(tx, key) || !accountMatches(tx, accountFilter)) return sum;
    return sum + effectiveExpense(tx);
  }, 0);
}

/** Spend for a category (incl. its subcategories) in a month, via the effectiveExpense contract. */
export function categorySpendInMonth(
  transactions: Transaction[],
  maps: Maps,
  categoryId: string,
  key: string,
): number {
  return transactions.reduce((sum, tx) => {
    if (!inMonth(tx, key)) return sum;
    if (!isInCategory(tx.categoryId, categoryId, maps.categoryById)) return sum;
    return sum + effectiveExpense(tx);
  }, 0);
}

export interface CategorySpend {
  category: Category;
  amount: number;
}

/** Spend grouped by top-level category, sorted descending. */
export function spendByRootCategory(
  transactions: Transaction[],
  maps: Maps,
  categories: Category[],
  key: string,
  accountFilter = "all",
): CategorySpend[] {
  const totals = new Map<string, number>();
  for (const tx of transactions) {
    if (!inMonth(tx, key) || !accountMatches(tx, accountFilter)) continue;
    const amount = effectiveExpense(tx);
    if (amount === 0) continue;
    const root = rootCategoryId(tx.categoryId, maps.categoryById) ?? "cat-other";
    totals.set(root, (totals.get(root) ?? 0) + amount);
  }
  return [...totals.entries()]
    .map(([id, amount]) => ({
      category: maps.categoryById.get(id) ?? fallbackCategory(id),
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);
}

function fallbackCategory(id: string): Category {
  return { id, name: "Other", icon: "📎", color: "220 8% 55%", parentId: null };
}

/** Spend per account for a month. */
export function spendByAccount(
  transactions: Transaction[],
  maps: Maps,
  accounts: Account[],
  key: string,
): { account: Account; amount: number }[] {
  return accounts
    .filter((a) => a.kind === "spending")
    .map((account) => ({
      account,
      amount: transactions.reduce(
        (sum, tx) =>
          inMonth(tx, key) && tx.accountId === account.id
            ? sum + effectiveExpense(tx)
            : sum,
        0,
      ),
    }))
    .sort((a, b) => b.amount - a.amount);
}

export type BudgetHealth = "under" | "warning" | "over";

export interface BudgetStatus {
  budget: Budget;
  category: Category | undefined;
  spent: number;
  limit: number;
  pct: number; // 0..1+
  health: BudgetHealth;
}

export function budgetStatuses(
  budgets: Budget[],
  transactions: Transaction[],
  maps: Maps,
  key: string,
): BudgetStatus[] {
  return budgets
    .filter((b) => b.month === null || b.month === key)
    .map((budget) => {
      const spent = categorySpendInMonth(transactions, maps, budget.categoryId, key);
      const pct = budget.limit > 0 ? spent / budget.limit : 0;
      const health: BudgetHealth = pct >= 1 ? "over" : pct >= 0.85 ? "warning" : "under";
      return {
        budget,
        category: maps.categoryById.get(budget.categoryId),
        spent,
        limit: budget.limit,
        pct,
        health,
      };
    });
}

export interface BudgetForecast extends BudgetStatus {
  /** Blended end-of-month projection. Equals `spent` for completed / non-current months. */
  projected: number;
  projectedPct: number; // projected / limit
  forecastHealth: BudgetHealth;
  overBy: number; // projected - limit (> 0 means trending over)
  /** True only when the month is in progress, so the UI knows to show the projection. */
  isProjected: boolean;
}

/**
 * Per-budget end-of-month projection (PRD forecast). History-blended: weights the category's
 * recent monthly average against the current daily pace, leaning on history early in the month
 * and on actual pace as it fills in. Only an in-progress month is projected; a completed or
 * non-current month returns its actual spend (`isProjected: false`). No model / training needed.
 */
export function budgetForecasts(
  budgets: Budget[],
  transactions: Transaction[],
  maps: Maps,
  key: string,
  today = new Date(),
  historyCount = 3,
): BudgetForecast[] {
  const { daysInMonth, daysElapsed, daysLeft, isCurrentMonth } = monthProgress(key, today);
  const statuses = budgetStatuses(budgets, transactions, maps, key);
  const histKeys = trailingKeys(prevMonthKey(key), historyCount);

  return statuses.map((s) => {
    if (!isCurrentMonth || daysElapsed >= daysInMonth) {
      return { ...s, projected: s.spent, projectedPct: s.pct, forecastHealth: s.health, overBy: s.spent - s.limit, isProjected: false };
    }
    const histVals = histKeys
      .map((mk) => categorySpendInMonth(transactions, maps, s.budget.categoryId, mk))
      .filter((v) => v > 0);
    const historicalAvg = histVals.length ? histVals.reduce((a, b) => a + b, 0) / histVals.length : 0;
    const linearPace = (s.spent / daysElapsed) * daysInMonth;
    const w = daysLeft / daysInMonth; // history weight, shrinks toward 0 over the month
    const projected = historicalAvg > 0 ? w * historicalAvg + (1 - w) * linearPace : linearPace;
    const projectedPct = s.limit > 0 ? projected / s.limit : 0;
    const forecastHealth: BudgetHealth = projectedPct >= 1 ? "over" : projectedPct >= 0.85 ? "warning" : "under";
    return { ...s, projected, projectedPct, forecastHealth, overBy: projected - s.limit, isProjected: true };
  });
}

export interface GoalProgress {
  goal: Goal;
  saved: number;
  pct: number; // 0..1
  daysLeft: number | null;
  onTrack: boolean;
}

export function goalSaved(goal: Goal, transactions: Transaction[]): number {
  return transactions.reduce((sum, t) => (t.goalId === goal.id ? sum + Math.abs(t.amount) : sum), goal.baseline);
}

export function goalProgress(goal: Goal, transactions: Transaction[], today = new Date()): GoalProgress {
  const saved = goalSaved(goal, transactions);
  const pct = goal.target > 0 ? saved / goal.target : 0;
  let daysLeft: number | null = null;
  if (goal.deadline) {
    const ms = new Date(goal.deadline).getTime() - today.getTime();
    daysLeft = Math.round(ms / 86_400_000);
  }
  // On track if progress keeps pace with elapsed time toward the deadline.
  const onTrack = daysLeft === null ? pct >= 1 : pct >= 1 || daysLeft > 0;
  return { goal, saved, pct, daysLeft, onTrack };
}

export interface TrendSeries {
  id: string; // "total" or a category id
  label: string;
  icon: string | null;
  /** "primary" for the total, else an HSL triplet for a category. */
  color: string;
  points: { key: string; amount: number }[];
}

/** Trailing `count` month keys ending at `key` (oldest first). */
function trailingKeys(key: string, count: number): string[] {
  const keys: string[] = [];
  let k = key;
  for (let i = 0; i < count; i++) {
    keys.unshift(k);
    k = prevMonthKey(k);
  }
  return keys;
}

/**
 * Trend series for the dashboard: a "Total" line plus the top-spending top-level
 * categories over the window (each its own monthly series, for switching).
 */
export function categoryTrends(
  transactions: Transaction[],
  maps: Maps,
  categories: Category[],
  key: string,
  count = 6,
  maxCategories = 6,
): TrendSeries[] {
  const keys = trailingKeys(key, count);
  const total: TrendSeries = {
    id: "total",
    label: "Total",
    icon: null,
    color: "primary",
    points: keys.map((mk) => ({ key: mk, amount: monthSpend(transactions, maps, mk) })),
  };

  const perCategory = categories
    .filter((c) => c.parentId === null)
    .map((c) => {
      const points = keys.map((mk) => ({
        key: mk,
        amount: categorySpendInMonth(transactions, maps, c.id, mk),
      }));
      return { id: c.id, label: c.name, icon: c.icon, color: c.color, points, sum: points.reduce((s, p) => s + p.amount, 0) };
    })
    .filter((x) => x.sum > 0)
    .sort((a, b) => b.sum - a.sum)
    .slice(0, maxCategories)
    .map(({ id, label, icon, color, points }) => ({ id, label, icon, color, points }));

  return [total, ...perCategory];
}

/** Per-day spend totals for a month (calendar heatmap). day is 1-based. */
export function dailySpend(
  transactions: Transaction[],
  maps: Maps,
  key: string,
): { day: number; amount: number }[] {
  const [y, m] = key.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const totals = new Array(days).fill(0);
  for (const tx of transactions) {
    if (!inMonth(tx, key)) continue;
    const day = new Date(tx.date).getDate();
    totals[day - 1] += effectiveExpense(tx);
  }
  return totals.map((amount, i) => ({ day: i + 1, amount }));
}

const TRANSFER_DAY_WINDOW = 3;

export interface ExistingTransferUpdate { id: string; goalId: string | null }
export interface TransferDetection { rows: Transaction[]; existingUpdates: ExistingTransferUpdate[] }

/**
 * Detect internal transfers when importing `newRows`, pairing each against `existing`
 * transactions (opposite amount, different account, within TRANSFER_DAY_WINDOW days, not
 * already a transfer). Marks the new row as a transfer and returns updates for the matched
 * existing counterpart. The OUTFLOW leg (amount < 0) links to a goal when the INFLOW's
 * account backs one. Pure — returns new data, mutates nothing.
 */
export function detectTransfersOnImport(
  newRows: Transaction[],
  existing: Transaction[],
  goals: Pick<Goal, "id" | "accountId">[],
): TransferDetection {
  const goalByAccount = new Map(goals.filter((g) => g.accountId).map((g) => [g.accountId as string, g.id]));
  const days = (a: string, b: string) => Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);
  const usedExisting = new Set<string>();
  const existingUpdates: ExistingTransferUpdate[] = [];

  const rows = newRows.map((orig) => {
    const r = { ...orig };
    const e = existing.find(
      (x) => !usedExisting.has(x.id) && x.kind !== "transfer" && x.amount === -r.amount && x.accountId !== r.accountId && days(x.date, r.date) <= TRANSFER_DAY_WINDOW,
    );
    if (!e) return r;
    usedExisting.add(e.id);
    r.kind = "transfer";
    if (r.amount < 0) {
      // new row is the outflow; existing is the inflow → dest = existing.accountId
      const goalId = goalByAccount.get(e.accountId) ?? null;
      r.goalId = goalId;
      existingUpdates.push({ id: e.id, goalId: null });
    } else {
      // new row is the inflow; existing is the outflow → dest = new row's account
      const goalId = goalByAccount.get(r.accountId) ?? e.goalId ?? null;
      existingUpdates.push({ id: e.id, goalId });
    }
    return r;
  });

  return { rows, existingUpdates };
}

export interface CapitalSummary {
  spendingBalance: number;
  savingsBalance: number;
  total: number;
}

export function capitalSummary(accounts: Account[]): CapitalSummary {
  const active = accounts.filter((a) => !a.archived);
  const spendingBalance = active.filter((a) => a.kind === "spending").reduce((s, a) => s + a.balance, 0);
  const savingsBalance = active.filter((a) => a.kind === "savings").reduce((s, a) => s + a.balance, 0);
  return { spendingBalance, savingsBalance, total: spendingBalance + savingsBalance };
}
