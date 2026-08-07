import {
  bucketByMonth,
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

  const prevKey = prevMonthKey(month);
  // Partition once; every month-scoped selector below then reads only its own month's rows.
  const buckets = bucketByMonth(data.transactions, [month, prevKey]);
  const cur = buckets.get(month)!;
  const prev = buckets.get(prevKey)!;

  const spent = monthSpend(cur, maps, month, accountFilter);
  const prevSpent = monthSpend(prev, maps, prevKey, accountFilter);
  const changePct = prevSpent > 0 ? ((spent - prevSpent) / prevSpent) * 100 : 0;

  const { daysInMonth, daysElapsed, daysLeft, isCurrentMonth } = monthProgress(month, today);

  const budgets = budgetStatuses(data.budgets, cur, maps, month);

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
    spendByRootCategory(cur, maps, data.categories, month, accountFilter).map((r) => ({ item: r.category, amount: r.amount })),
    spendByRootCategory(prev, maps, data.categories, prevKey, accountFilter).map((r) => ({ item: r.category, amount: r.amount })),
    (c) => c.id,
  );
  const byTagDelta = withDelta<Tag>(
    spendByTag(cur, data.tags, month, accountFilter).map((r) => ({ item: r.tag, amount: r.amount })),
    spendByTag(prev, data.tags, prevKey, accountFilter).map((r) => ({ item: r.tag, amount: r.amount })),
    (t) => t.id,
  );
  const byAccountDelta = withDelta<Account>(
    spendByAccount(cur, maps, data.accounts, month).map((r) => ({ item: r.account, amount: r.amount })),
    spendByAccount(prev, maps, data.accounts, prevKey).map((r) => ({ item: r.account, amount: r.amount })),
    (a) => a.id,
  );
  const subcategoryDeltas = (parentId: string) =>
    withDelta<Category>(
      spendBySubcategory(cur, maps, parentId, month, accountFilter).map((r) => ({ item: r.category, amount: r.amount })),
      spendBySubcategory(prev, maps, parentId, prevKey, accountFilter).map((r) => ({ item: r.category, amount: r.amount })),
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
