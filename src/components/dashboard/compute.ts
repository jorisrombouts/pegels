import {
  budgetStatuses,
  buildMaps,
  capitalSummary,
  monthProgress,
  monthSpend,
  prevMonthKey,
  spendByAccount,
  spendByRootCategory,
  spendBySubcategory,
  spendByTag,
  withDelta,
} from "@/lib/domain/selectors";
import { categoryForecasts, monthForecast } from "@/lib/forecast/category-forecast";
import { detectRecurring } from "@/lib/forecast/recurring";
import type { Dataset } from "@/data/mock";
import type { Account, Category, Tag } from "@/lib/domain/types";

export function computeDashboard(data: Dataset, month: string, accountFilter: string, today = new Date()) {
  const maps = buildMaps(data.categories);

  const spent = monthSpend(data.transactions, maps, month, accountFilter);
  const prevKey = prevMonthKey(month);
  const prevSpent = monthSpend(data.transactions, maps, prevKey, accountFilter);
  const changePct = prevSpent > 0 ? ((spent - prevSpent) / prevSpent) * 100 : 0;

  const { daysInMonth, daysElapsed, daysLeft, isCurrentMonth } = monthProgress(month, today);

  const budgets = budgetStatuses(data.budgets, data.transactions, maps, month);

  // Scope the forecast to the selected account so the hero agrees with the breakdown below it.
  // Recurrence detection runs on the same slice, which is what makes "your rent" mean your rent.
  const forecastTxs =
    accountFilter === "all" ? data.transactions : data.transactions.filter((t) => t.accountId === accountFilter);
  const recurring = detectRecurring(forecastTxs, month);
  const forecastOpts = { today, recurring, budgets: data.budgets };
  const forecast = monthForecast(forecastTxs, maps, month, forecastOpts);
  const categoryOutlook = categoryForecasts(forecastTxs, maps, data.categories, month, forecastOpts);

  const projectedChangePct = prevSpent > 0 ? ((forecast.projected - prevSpent) / prevSpent) * 100 : null;

  const byCategoryDelta = withDelta<Category>(
    spendByRootCategory(data.transactions, maps, data.categories, month, accountFilter).map((r) => ({ item: r.category, amount: r.amount })),
    spendByRootCategory(data.transactions, maps, data.categories, prevKey, accountFilter).map((r) => ({ item: r.category, amount: r.amount })),
    (c) => c.id,
  );
  const byTagDelta = withDelta<Tag>(
    spendByTag(data.transactions, data.tags, month, accountFilter).map((r) => ({ item: r.tag, amount: r.amount })),
    spendByTag(data.transactions, data.tags, prevKey, accountFilter).map((r) => ({ item: r.tag, amount: r.amount })),
    (t) => t.id,
  );
  const byAccountDelta = withDelta<Account>(
    spendByAccount(data.transactions, maps, data.accounts, month).map((r) => ({ item: r.account, amount: r.amount })),
    spendByAccount(data.transactions, maps, data.accounts, prevKey).map((r) => ({ item: r.account, amount: r.amount })),
    (a) => a.id,
  );
  const subcategoryDeltas = (parentId: string) =>
    withDelta<Category>(
      spendBySubcategory(data.transactions, maps, parentId, month, accountFilter).map((r) => ({ item: r.category, amount: r.amount })),
      spendBySubcategory(data.transactions, maps, parentId, prevKey, accountFilter).map((r) => ({ item: r.category, amount: r.amount })),
      (c) => c.id,
    );

  return {
    spent,
    prevKey,
    prevSpent,
    changePct,
    daysInMonth,
    daysElapsed,
    daysLeft,
    isCurrentMonth,
    forecast,
    categoryOutlook,
    projectedChangePct,
    byCategoryDelta,
    byTagDelta,
    byAccountDelta,
    subcategoryDeltas,
    budgets,
    capital: capitalSummary(data.accounts),
  };
}
