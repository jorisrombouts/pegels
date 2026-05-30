"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { Ring } from "@/components/ui/ring";
import { SafeToSpendWidget } from "./safe-to-spend-widget";
import { TrendWidget } from "./trend-widget";
import { CalendarHeatmap, type DaySpend } from "./calendar-heatmap";
import { RecentActivity } from "./recent-activity";
import type { computeDashboard } from "./compute";
import { formatSEK, formatSEKAbs, formatSignedPct, monthLabel } from "@/lib/format";
import type { TrendSeries } from "@/lib/domain/selectors";
import type { Category, Transaction } from "@/lib/domain/types";
import type { WidgetSize } from "@/store/ui";

// Recharts in its own chunk (PRD perf budget §7.5) — not in the initial route JS.
const CategoryDonut = dynamic(() => import("./category-donut").then((m) => m.CategoryDonut), {
  ssr: false,
  loading: () => <div className="grid h-[200px] place-items-center text-xs text-muted-foreground">Loading chart…</div>,
});

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

/** Title shown in the "Edit layout" picker (and as aria context). */
export const widgetTitles: Record<string, string> = {
  total: "This month",
  pace: "Daily pace",
  category: "Spending by category",
  trend: "Trend",
  budgets: "Budgets",
  goals: "Savings goals",
  calendar: "Daily spend",
  recent: "Recent activity",
  byaccount: "Spend by account",
};

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

function Dot({ color }: { color: string }) {
  return <span className="inline-block size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
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
    const over = d.budgetRemaining < 0;
    const hasBudget = d.budgetLimitTotal > 0;
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

          {/* Supporting stats: left to spend + pace */}
          <div className="mt-5 flex gap-3">
            {hasBudget ? (
              <>
                <HeroStat
                  label={over ? "Over budget" : "Left to spend"}
                  value={formatSEKAbs(d.budgetRemaining, masked)}
                  sub={`of ${formatSEKAbs(d.budgetLimitTotal, masked)} budget`}
                  tone={over ? "hsl(var(--negative))" : undefined}
                />
                <HeroStat
                  label={d.safePerDay != null ? "Safe to spend" : "Avg / day"}
                  value={`${formatSEKAbs(d.safePerDay ?? d.avgPerDay, masked)}/day`}
                  sub={d.safePerDay != null ? `${d.daysLeft} days left` : `over ${d.daysInMonth} days`}
                  tone={d.safePerDay != null ? "hsl(var(--positive))" : undefined}
                />
              </>
            ) : (
              <HeroStat label="Avg / day" value={`${formatSEKAbs(d.avgPerDay, masked)}/day`} sub={`over ${d.daysElapsed} days`} />
            )}
          </div>
        </div>
      </Card>
    );
  },

  pace: ({ d, masked }, size) => (
    <SafeToSpendWidget
      data={{ spent: d.spent, limit: d.budgetLimitTotal, daysElapsed: d.daysElapsed, daysInMonth: d.daysInMonth }}
      size={size}
      masked={masked}
    />
  ),

  category: ({ d, masked, onNavigate }, size) => {
    const go = (id: string) => onNavigate(`/transactions?category=${id}`);
    return (
      <Card className="h-full">
        <CardHeader label="Spending by category" />
        {d.byCategory.length === 0 ? (
          <EmptyHint>No spending this month.</EmptyHint>
        ) : size === "small" ? (
          // Compact: bar list, no chart chunk.
          <ul className="space-y-3">
            {d.byCategory.slice(0, 4).map(({ category, amount }) => (
              <li key={category.id}>
                <button onClick={() => go(category.id)} className="pressable block w-full text-left">
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0">{category.icon}</span>
                      <span className="truncate">{category.name}</span>
                    </span>
                    <span className="tnum shrink-0 text-muted-foreground">{formatSEKAbs(amount, masked)}</span>
                  </div>
                  <ProgressBar pct={amount / d.byCategory[0].amount} color={`hsl(${category.color})`} height={6} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          // Medium/large: donut + legend.
          <>
            <CategoryDonut data={d.byCategory} total={d.spent} masked={masked} onSlice={go} />
            <ul className="mt-4 space-y-1">
              {d.byCategory.slice(0, 5).map(({ category, amount }) => (
                <li key={category.id}>
                  <button onClick={() => go(category.id)} className="pressable -mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm hover:bg-[hsl(var(--muted)/0.45)]">
                    <span className="flex min-w-0 items-center gap-2">
                      <Dot color={`hsl(${category.color})`} />
                      <span className="truncate">{category.icon} {category.name}</span>
                    </span>
                    <span className="tnum shrink-0 text-muted-foreground">{formatSEKAbs(amount, masked)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    );
  },

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

  goals: ({ d, masked, onNavigate }, size) => (
    <Card className="h-full">
      <CardHeader label="Savings goals" action={<AllLink href="/goals" />} />
      {d.goals.length === 0 ? (
        <EmptyHint>No goals yet.</EmptyHint>
      ) : (
        <div className={`grid gap-2 ${size === "small" ? "grid-cols-1" : "grid-cols-2"}`}>
          {d.goals.map((g) => (
            <button
              key={g.goal.id}
              onClick={() => onNavigate(`/goals?goal=${g.goal.id}`)}
              className="pressable -mx-1 flex min-w-0 items-center gap-3 rounded-xl px-1 py-1 text-left hover:bg-[hsl(var(--muted)/0.45)]"
            >
              <Ring pct={g.pct} label={`${Math.round(g.pct * 100)}%`} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {g.goal.icon} {g.goal.name}
                </p>
                <p className="tnum truncate text-xs text-muted-foreground">
                  {formatSEKAbs(g.saved, masked)} / {formatSEKAbs(g.goal.target, masked)}
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

  byaccount: ({ d, masked, onNavigate }) => (
    <Card className="h-full">
      <CardHeader label="Spend by account" action={<AllLink href="/accounts" />} />
      <ul className="space-y-2">
        {d.byAccount.map(({ account, amount }) => {
          const top = d.byAccount[0]?.amount || 1;
          return (
            <li key={account.id}>
              <button onClick={() => onNavigate(`/transactions?account=${account.id}`)} className="pressable block w-full text-left">
                <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0">{account.icon}</span>
                    <span className="truncate">{account.name}</span>
                  </span>
                  <span className="tnum shrink-0 text-muted-foreground">{formatSEKAbs(amount, masked)}</span>
                </div>
                <ProgressBar pct={amount / top} color={`hsl(${account.color})`} height={6} />
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  ),
};
