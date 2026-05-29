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
} from "@/lib/domain/selectors";
import type { Dataset } from "@/data/mock";

export function computeDashboard(data: Dataset, month: string, accountFilter: string, today = new Date()) {
  const maps = buildMaps(data.categories);

  const spent = monthSpend(data.transactions, maps, month, accountFilter);
  const prevKey = prevMonthKey(month);
  const prevSpent = monthSpend(data.transactions, maps, prevKey, accountFilter);
  const changePct = prevSpent > 0 ? ((spent - prevSpent) / prevSpent) * 100 : 0;

  const { daysInMonth, daysElapsed, daysLeft, isCurrentMonth } = monthProgress(month, today);

  const budgets = budgetStatuses(data.budgets, data.transactions, maps, month);
  const budgetLimitTotal = budgets.reduce((s, b) => s + b.limit, 0);

  const budgetRemaining = budgetLimitTotal - spent; // can be negative if over
  // Safe to spend per day for the rest of the month (only meaningful for the current month).
  const safePerDay = isCurrentMonth && daysLeft > 0 ? Math.max(budgetRemaining, 0) / daysLeft : null;
  const avgPerDay = daysElapsed > 0 ? spent / daysElapsed : 0;

  return {
    spent,
    prevKey,
    prevSpent,
    changePct,
    daysInMonth,
    daysElapsed,
    daysLeft,
    isCurrentMonth,
    budgetRemaining,
    safePerDay,
    avgPerDay,
    byCategory: spendByRootCategory(data.transactions, maps, data.categories, month, accountFilter),
    byAccount: spendByAccount(data.transactions, maps, data.accounts, month),
    budgets,
    budgetLimitTotal,
    goals: data.goals.map((g) => goalProgress(g, data.transactions, today)),
    capital: capitalSummary(data.accounts),
  };
}
