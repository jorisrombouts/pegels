"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Ring } from "@/components/ui/ring";
import { BreakdownWidget } from "./breakdown-widget";
import { ForecastWidget } from "./forecast-widget";
import { TrendWidget } from "./trend-widget";
import { CalendarHeatmap, type DaySpend } from "./calendar-heatmap";
import { RecentActivity } from "./recent-activity";
import type { computeDashboard } from "./compute";
import { formatSEK, formatSEKAbs, formatSignedPct, monthLabel } from "@/lib/format";
import type { TrendSeries } from "@/lib/domain/selectors";
import type { Category, Transaction } from "@/lib/domain/types";

export type WidgetSize = "small" | "medium" | "large";

export interface DashCtx {
  d: ReturnType<typeof computeDashboard>;
  masked: boolean;
  month: string;
  categoryById: Map<string, Category>;
  recent: Transaction[];
  trend: TrendSeries[];
  daily: DaySpend[];
  onNavigate: (href: string) => void;
}

/**
 * The dashboard, in order. Fixed — widgets are no longer user-arrangeable, so the order and
 * per-widget size live here next to the renderers instead of in persisted UI state.
 * Mediums are paired so each grid row fills.
 */
export const DASHBOARD_LAYOUT: { id: string; size: WidgetSize }[] = [
  { id: "total", size: "large" },
  { id: "forecast", size: "medium" },
  { id: "breakdown", size: "medium" },
  { id: "budgets", size: "medium" },
  { id: "recent", size: "medium" },
  { id: "trend", size: "large" },
  { id: "calendar", size: "medium" },
];

/**
 * Grid column span per size. The dashboard grid is 1 col on mobile, 2 on md,
 * 4 on lg — so size maps to genuinely different widths on desktop:
 *   small = 1/4, medium = 1/2, large = full.
 */
export function colSpan(size: WidgetSize): string {
  if (size === "large") return "md:col-span-2 lg:col-span-4";
  if (size === "medium") return "md:col-span-2 lg:col-span-2";
  return "lg:col-span-1"; // small: half on md, quarter on lg
}

function AllLink({ href }: { href: string }) {
  return (
    <Link href={href} className="pressable inline-block text-xs font-semibold text-primary hover:underline">
      All →
    </Link>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

/** A labelled stat in the hero's supporting row. */
function HeroStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-2xl glass-inset px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-display tnum mt-0.5 truncate text-xl font-bold" style={tone ? { color: tone } : undefined}>{value}</p>
      {sub && <p className="tnum mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export const widgets: Record<string, (ctx: DashCtx, size: WidgetSize) => React.ReactNode> = {
  total: ({ d, masked }) => {
    const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
    const f = d.forecast;
    return (
      <Card className="flex h-full flex-col justify-center">
        <CardHeader label="This month" />
        <div className="flex flex-1 flex-col justify-center">
          {/* Headline: spent + vs last month */}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-display tnum text-5xl font-bold">{formatSEK(-d.spent, masked)}</span>
            {d.prevSpent > 0 && (
              <span
                className="tnum inline-flex items-center gap-1 text-sm font-semibold"
                style={{ color: d.changePct <= 0 ? "hsl(var(--positive))" : "hsl(var(--negative))" }}
              >
                {d.changePct <= 0 ? <ArrowDownRight className="size-4" /> : <ArrowUpRight className="size-4" />}
                {formatSignedPct(d.changePct)} vs {monthLabel(d.prevKey).split(" ")[0]}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">spent so far</p>

          {/* What's committed vs what you can still steer — the split the projection rests on. */}
          <p className="tnum mt-3 text-xs text-muted-foreground">
            {formatSEKAbs(f.recurringLanded, masked)} fixed · {formatSEKAbs(f.variableLanded, masked)} variable
            {f.recurringExpected > 0 && ` · ${formatSEKAbs(f.recurringExpected, masked)} still to come`}
          </p>

          {/* Supporting stats: what's left to spend + where the month lands */}
          <div className="mt-4 flex gap-3">
            {f.dailyAllowance !== null ? (
              <HeroStat
                label="Left to spend"
                value={`${formatSEKAbs(f.dailyAllowance, masked)}/day`}
                sub={`${days(d.daysLeft)} left, fixed costs deducted`}
              />
            ) : (
              <HeroStat
                label="Variable pace"
                value={`${formatSEKAbs(f.variablePace, masked)}/day`}
                sub={`over ${days(d.daysElapsed)}`}
              />
            )}
            {f.isProjected && (
              <HeroStat
                label="Projected"
                value={formatSEKAbs(f.projected, masked)}
                sub={
                  d.projectedChangePct != null
                    ? `${formatSignedPct(d.projectedChangePct)} vs ${monthLabel(d.prevKey).split(" ")[0]}`
                    : `${days(d.daysLeft)} left`
                }
                tone={d.projectedChangePct != null ? (d.projectedChangePct <= 0 ? "hsl(var(--positive))" : "hsl(var(--negative))") : undefined}
              />
            )}
          </div>
        </div>
      </Card>
    );
  },

  forecast: ({ d, masked, onNavigate }) => (
    <ForecastWidget rows={d.categoryOutlook} masked={masked} onNavigate={onNavigate} />
  ),

  breakdown: (ctx, size) => <BreakdownWidget ctx={ctx} size={size} />,

  trend: ({ trend, masked }, size) => <TrendWidget series={trend} size={size} masked={masked} />,

  budgets: ({ d, masked, onNavigate }, size) => (
    <Card className="h-full">
      <CardHeader label="Budgets" action={<AllLink href="/budgets" />} />
      {d.budgets.length === 0 ? (
        <EmptyHint>No budgets yet.</EmptyHint>
      ) : (
        <div className={`grid gap-2 ${size === "small" ? "grid-cols-1" : "grid-cols-2"}`}>
          {d.budgets.map((b) => (
            <button
              key={b.budget.id}
              onClick={() => onNavigate(`/transactions?budget=${b.budget.id}`)}
              className="pressable -mx-1 flex min-w-0 items-center gap-3 rounded-xl px-1 py-1 text-left hover:bg-[hsl(var(--muted)/0.45)]"
            >
              <Ring
                pct={b.pct}
                label={`${Math.round(b.pct * 100)}%`}
                color={b.health === "over" ? "hsl(var(--negative))" : b.health === "warning" ? "hsl(var(--warning))" : "hsl(var(--primary))"}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {b.category?.icon} {b.category?.name}
                </p>
                <p className="tnum truncate text-xs text-muted-foreground">
                  {formatSEKAbs(b.spent, masked)} / {formatSEKAbs(b.limit, masked)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </Card>
  ),

  calendar: ({ daily, month, masked }, size) => <CalendarHeatmap month={month} days={daily} size={size} masked={masked} />,

  recent: ({ recent, categoryById, masked, onNavigate }) => (
    <RecentActivity
      transactions={recent}
      categoryById={categoryById}
      masked={masked}
      onSelect={(id) => onNavigate(`/transactions?tx=${id}`)}
    />
  ),
};
