import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { formatSEK } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WidgetSize } from "@/store/ui";

export interface SafeToSpendData {
  spent: number;
  limit: number; // total monthly budget cap (0 = no budget set)
  daysElapsed: number; // days counted so far this month (>=1)
  daysInMonth: number;
}

/**
 * "Daily Pace" — the canonical layout-fragile widget (PRD §6.1, §8).
 * - size="small": header + progress row only, no sparkline / no "ideal pace".
 * - size>="medium": sparkline (actual vs ideal pace) + legend.
 * - no-budget empty state with a CTA.
 */
export function SafeToSpendWidget({
  data,
  size = "medium",
  masked = false,
}: {
  data: SafeToSpendData;
  size?: WidgetSize;
  masked?: boolean;
}) {
  const { spent, limit, daysElapsed, daysInMonth } = data;

  if (limit <= 0) {
    return (
      <Card className="flex h-full flex-col">
        <CardHeader label="Daily Pace" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
          <p className="text-sm text-muted-foreground">No budget set for this month.</p>
          <Link href="/budgets" className="text-sm font-semibold text-primary hover:underline">
            Set a budget →
          </Link>
        </div>
      </Card>
    );
  }

  const pace = daysElapsed > 0 ? spent / daysElapsed : 0;
  const pct = limit > 0 ? spent / limit : 0;
  const idealPace = limit / daysInMonth;
  const onPace = pace <= idealPace;
  const paceColor = onPace ? "hsl(var(--positive))" : "hsl(var(--warning))";

  return (
    <Card className="flex h-full flex-col" data-testid="safe-to-spend">
      <CardHeader label="Daily Pace" />

      <div>
        <p className="font-display tnum text-3xl font-bold" style={{ color: paceColor }}>
          {formatSEK(Math.round(pace), masked)}
          <span className="text-base font-medium text-muted-foreground">/day</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">avg pace · {daysInMonth} days</p>
      </div>

      <div className="mt-5">
        <ProgressBar pct={pct} color={paceColor} />
        <div className="tnum mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {formatSEK(spent, masked)} / {formatSEK(limit, masked)}
          </span>
          <span>{Math.round(pct * 100)}%</span>
        </div>
      </div>

      {size !== "small" && (
        <div className="mt-5" data-testid="safe-to-spend-sparkline">
          <PaceSparkline spent={spent} limit={limit} daysElapsed={daysElapsed} daysInMonth={daysInMonth} color={paceColor} />
          <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
            <Legend className="bg-[hsl(var(--positive))]" label="actual" />
            <Legend dashed label="ideal pace" />
          </div>
        </div>
      )}
    </Card>
  );
}

function Legend({ label, className, dashed }: { label: string; className?: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn("inline-block h-0.5 w-4 rounded-full", className)}
        style={dashed ? { borderTop: "1.5px dashed hsl(var(--muted-foreground))" } : undefined}
      />
      {label}
    </span>
  );
}

/** Tiny SVG sparkline: cumulative actual spend vs the straight ideal-pace line. */
function PaceSparkline({
  spent,
  limit,
  daysElapsed,
  daysInMonth,
  color,
}: {
  spent: number;
  limit: number;
  daysElapsed: number;
  daysInMonth: number;
  color: string;
}) {
  const w = 280;
  const h = 64;
  const max = Math.max(limit, spent) || 1;
  // Approximate cumulative actual as linear to today (we only know the total).
  const actualEndX = (daysElapsed / daysInMonth) * w;
  const actualEndY = h - (spent / max) * h;
  const idealEndY = h - (limit / max) * h;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full" preserveAspectRatio="none" aria-hidden>
      <line x1={0} y1={h} x2={w} y2={idealEndY} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="4 4" />
      <polyline points={`0,${h} ${actualEndX},${actualEndY}`} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={actualEndX} cy={actualEndY} r={3} fill={color} />
    </svg>
  );
}
