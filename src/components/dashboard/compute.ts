import {
  bucketByMonth,
  budgetStatuses,
  buildMaps,
  capitalSummary,
  goalProgress,
  monthProgress,
  monthSpend,
  prevMonthKey,
  spendByAccount,
  spendByRootCategory,
  spendBySubcategory,
  spendByTag,
  withDelta,
} from "@/lib/domain/selectors";
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
  const budgetLimitTotal = budgets.reduce((s, b) => s + b.limit, 0);

  const avgPerDay = daysElapsed > 0 ? spent / daysElapsed : 0;
  // End-of-month projection: scale the current daily pace across the whole month. A completed /
  // non-current month is already final, so its projection is just its actual spend.
  const projected = isCurrentMonth ? avgPerDay * daysInMonth : spent;
  const projectedChangePct = prevSpent > 0 ? ((projected - prevSpent) / prevSpent) * 100 : null;

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
    avgPerDay,
    projected,
    projectedChangePct,
    byCategoryDelta,
    byTagDelta,
    byAccountDelta,
    subcategoryDeltas,
    budgets,
    budgetLimitTotal,
    goals: data.goals.map((g) => goalProgress(g, data.transactions, today)),
    capital: capitalSummary(data.accounts),
  };
}
