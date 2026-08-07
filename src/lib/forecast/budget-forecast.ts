import { budgetStatuses, type BudgetHealth, type BudgetStatus, type Maps } from "@/lib/domain/selectors";
import type { Budget, Transaction } from "@/lib/domain/types";
import { forecastForCategory } from "./category-forecast";
import { detectRecurring } from "./recurring";

export interface BudgetForecast extends BudgetStatus {
  /** End-of-month projection. Equals `spent` for completed / non-current months. */
  projected: number;
  projectedPct: number; // projected / limit
  forecastHealth: BudgetHealth;
  overBy: number; // projected - limit (> 0 means trending over)
  /** True only when the month is in progress, so the UI knows to show the projection. */
  isProjected: boolean;
}

/**
 * Budget health, projected to month end.
 *
 * A thin adapter over the shared forecast engine — deliberately not its own projection. Two
 * forecasters that disagree is worse than one that's wrong, and the previous implementation here
 * blended the *whole* projection against the *whole* historical average, double-counting fixed
 * costs at both ends.
 */
export function budgetForecasts(
  budgets: Budget[],
  transactions: Transaction[],
  maps: Maps,
  key: string,
  today = new Date(),
  historyCount = 3,
): BudgetForecast[] {
  const statuses = budgetStatuses(budgets, transactions, maps, key);
  if (!statuses.length) return [];
  const recurring = detectRecurring(transactions, key); // detect once, share across budgets

  return statuses.map((s) => {
    const f = forecastForCategory(transactions, maps, s.budget.categoryId, key, {
      today,
      recurring,
      historyMonths: historyCount,
    });
    const projected = f.isProjected ? f.projected : s.spent;
    const projectedPct = s.limit > 0 ? projected / s.limit : 0;
    const forecastHealth: BudgetHealth = projectedPct >= 1 ? "over" : projectedPct >= 0.85 ? "warning" : "under";
    return { ...s, projected, projectedPct, forecastHealth, overBy: projected - s.limit, isProjected: f.isProjected };
  });
}
