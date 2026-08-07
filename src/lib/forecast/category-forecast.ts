import { effectiveExpense } from "@/lib/domain/effectiveExpense";
import { inMonth, isInCategory, monthProgress, prevMonthKey, type Maps } from "@/lib/domain/selectors";
import type { Budget, Category, Transaction } from "@/lib/domain/types";
import { recurringKey } from "./normalize";
import { detectRecurring, type RecurringCharge } from "./recurring";
import { median } from "./stats";

export type ForecastVerdict = "on-track" | "trending-over" | "no-basis" | "settled";

export interface Forecast {
  /** Spend that has already happened this month (effectiveExpense). */
  landed: number;
  /** The part of `landed` matched to a recurring charge. */
  recurringLanded: number;
  /** Recurring charges that haven't landed yet — including overdue ones. */
  recurringExpected: number;
  /** Charges whose typical day has passed without landing. */
  recurringLate: RecurringCharge[];
  variableLanded: number;
  variablePace: number;
  variableProjected: number;
  /** landed + recurringExpected + variableProjected. */
  projected: number;
  /** A typical month for this category — median of the last completed months. Null with no history. */
  baseline: number | null;
  vsBaselinePct: number | null;
  /** kr/day of variable spend left to land on target. Null when there's nothing to steer. */
  dailyAllowance: number | null;
  verdict: ForecastVerdict;
  /** True only while the month is still running. */
  isProjected: boolean;
}

export interface CategoryForecast extends Forecast {
  category: Category;
}

export interface ForecastOptions {
  today?: Date;
  /** Pass a shared result to avoid re-detecting per category. */
  recurring?: RecurringCharge[];
  budgets?: Budget[];
  historyMonths?: number;
}

const HISTORY_MONTHS = 3;
/** Below this, a not-yet-landed charge is too shaky to count on. */
const MIN_CHARGE_CONFIDENCE = 0.5;
/** A category this fixed has nothing left to steer. */
const SETTLED_RECURRING_SHARE = 0.9;
/** Over target by more than this reads as trending over. */
const OVER_MARGIN = 1.05;
/** Before this many days, a pace built from history-less data is noise. */
const MIN_DAYS_FOR_PACE = 7;

/** Amount tolerance when deciding whether a transaction *is* a given recurring charge. */
function matchesCharge(tx: Transaction, charge: RecurringCharge): boolean {
  if (recurringKey(tx.description) !== charge.key) return false;
  const tolerance = Math.max(3 * charge.amountMad, 0.15 * charge.typicalAmount);
  return Math.abs(effectiveExpense(tx) - charge.typicalAmount) <= tolerance;
}

function spendIn(transactions: Transaction[], key: string, include: (tx: Transaction) => boolean): number {
  return transactions.reduce((sum, tx) => (inMonth(tx, key) && include(tx) ? sum + effectiveExpense(tx) : sum), 0);
}

/**
 * Project where a slice of spending lands at month end, by separating what repeats from what
 * doesn't.
 *
 * The whole point: `landed + recurringExpected + variablePace * daysLeft`. Only the variable
 * component is extrapolated, and only across the days that remain — so rent landing on the 1st is
 * counted once instead of being multiplied by the month.
 */
function buildForecast(
  transactions: Transaction[],
  key: string,
  include: (tx: Transaction) => boolean,
  charges: RecurringCharge[],
  opts: ForecastOptions,
  budgetLimit: number | null,
): Forecast {
  const today = opts.today ?? new Date();
  const historyMonths = opts.historyMonths ?? HISTORY_MONTHS;
  const { daysInMonth, daysElapsed, daysLeft, isCurrentMonth, isFutureMonth } = monthProgress(key, today);
  const isPast = !isCurrentMonth && !isFutureMonth;

  const landed = spendIn(transactions, key, include);

  // A typical month: the median of the completed months before this one.
  const histKeys: string[] = [];
  for (let i = 0, k = prevMonthKey(key); i < historyMonths; i++, k = prevMonthKey(k)) histKeys.push(k);
  const histVals = histKeys.map((k) => spendIn(transactions, k, include));
  const nonZero = histVals.filter((v) => v > 0);
  // Keep the zeros for a category that genuinely skips months; drop them when there's barely any signal.
  const baseline = nonZero.length === 0 ? null : median(nonZero.length >= 2 ? histVals : nonZero);

  if (isPast) {
    return {
      landed, recurringLanded: landed, recurringExpected: 0, recurringLate: [],
      variableLanded: 0, variablePace: 0, variableProjected: 0,
      projected: landed,
      baseline,
      vsBaselinePct: baseline ? ((landed - baseline) / baseline) * 100 : null,
      dailyAllowance: null,
      verdict: "settled",
      isProjected: false,
    };
  }

  // Split what's landed into the part that repeats and the part that doesn't.
  const monthTxs = transactions.filter((tx) => inMonth(tx, key) && include(tx));
  const recurringLate: RecurringCharge[] = [];
  let recurringLanded = 0;
  let recurringExpected = 0;
  for (const charge of charges) {
    const hit = monthTxs.find((tx) => matchesCharge(tx, charge));
    if (hit) {
      recurringLanded += effectiveExpense(hit);
      continue;
    }
    if (charge.confidence < MIN_CHARGE_CONFIDENCE) continue;
    recurringExpected += charge.typicalAmount;
    if (charge.typicalDay < daysElapsed) recurringLate.push(charge);
  }

  const variableLanded = Math.max(0, landed - recurringLanded);
  const variablePace = daysElapsed > 0 ? variableLanded / daysElapsed : 0;

  // Early in the month the pace is a small sample, so lean on history; the weight decays to zero
  // as the month fills in. Blending only the *variable* part is what makes this valid — the old
  // whole-projection blend double-counted fixed costs at both ends.
  const typicalRecurring = charges.reduce((s, c) => s + c.typicalAmount, 0);
  const paceProjection = variablePace * daysLeft;
  let variableProjected = paceProjection;
  if (baseline !== null) {
    const variableBaseline = Math.max(0, baseline - typicalRecurring);
    const w = daysInMonth > 0 ? daysLeft / daysInMonth : 0;
    variableProjected = w * (variableBaseline * (daysLeft / daysInMonth)) + (1 - w) * paceProjection;
  }

  const projected = landed + recurringExpected + variableProjected;

  const target = budgetLimit ?? baseline;
  const isSettled = target !== null && target > 0 && typicalRecurring >= SETTLED_RECURRING_SHARE * target;
  const noBasis = baseline === null && daysElapsed < MIN_DAYS_FOR_PACE;

  let verdict: ForecastVerdict;
  if (noBasis) verdict = "no-basis";
  else if (isSettled) verdict = "settled";
  else if (target !== null && projected > target * OVER_MARGIN) verdict = "trending-over";
  else verdict = "on-track";

  const steerable = target !== null && !isSettled && !noBasis && daysLeft > 0;
  const dailyAllowance = steerable ? Math.max(0, (target - landed - recurringExpected) / daysLeft) : null;

  return {
    landed, recurringLanded, recurringExpected, recurringLate,
    variableLanded, variablePace, variableProjected,
    projected,
    baseline,
    vsBaselinePct: baseline ? ((projected - baseline) / baseline) * 100 : null,
    dailyAllowance,
    verdict,
    isProjected: true,
  };
}

function budgetLimitFor(budgets: Budget[] | undefined, categoryId: string, key: string): number | null {
  const b = budgets?.find((x) => x.categoryId === categoryId && (x.month === null || x.month === key));
  return b ? b.limit : null;
}

/** Where one category (including its subcategories) lands at month end. */
export function forecastForCategory(
  transactions: Transaction[],
  maps: Maps,
  categoryId: string,
  key: string,
  opts: ForecastOptions = {},
): Forecast {
  const recurring = opts.recurring ?? detectRecurring(transactions, key);
  const inCat = (id: string | null) => isInCategory(id, categoryId, maps.categoryById);
  return buildForecast(
    transactions,
    key,
    (tx) => inCat(tx.categoryId),
    recurring.filter((c) => inCat(c.categoryId)),
    opts,
    budgetLimitFor(opts.budgets, categoryId, key),
  );
}

/** Where total spending lands at month end, across every category. */
export function monthForecast(
  transactions: Transaction[],
  maps: Maps,
  key: string,
  opts: ForecastOptions = {},
): Forecast {
  const recurring = opts.recurring ?? detectRecurring(transactions, key);
  return buildForecast(transactions, key, () => true, recurring, opts, null);
}

/** One forecast per top-level category that has activity, biggest projection first. */
export function categoryForecasts(
  transactions: Transaction[],
  maps: Maps,
  categories: Category[],
  key: string,
  opts: ForecastOptions = {},
): CategoryForecast[] {
  const recurring = opts.recurring ?? detectRecurring(transactions, key);
  return categories
    .filter((c) => c.parentId === null)
    .map((category) => ({ category, ...forecastForCategory(transactions, maps, category.id, key, { ...opts, recurring }) }))
    .filter((f) => f.landed > 0 || f.recurringExpected > 0 || (f.baseline ?? 0) > 0)
    .sort((a, b) => b.projected - a.projected);
}
