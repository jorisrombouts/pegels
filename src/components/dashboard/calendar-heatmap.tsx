"use client";

import { Card, CardHeader } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatSEKAbs, dayLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WidgetSize } from "./registry";

export interface DaySpend {
  day: number;
  amount: number;
}

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** Daily spend intensity for the month, Mon-first grid. */
export function CalendarHeatmap({
  month,
  days,
  size = "medium",
  masked = false,
}: {
  month: string; // yyyy-mm
  days: DaySpend[];
  size?: WidgetSize;
  masked?: boolean;
}) {
  const [y, m] = month.split("-").map(Number);
  // JS: 0=Sun..6=Sat; convert to Mon-first 0..6.
  const firstWeekday = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const total = days.reduce((s, d) => s + d.amount, 0);
  const busiest = days.reduce((a, b) => (b.amount > a.amount ? b : a), { day: 0, amount: 0 });

  // Color by a day's *percentile rank* among the month's spending days, so the scale
  // reflects relative spend and isn't dominated by one outlier (e.g. the mortgage).
  const spendAmounts = days.map((d) => d.amount).filter((a) => a > 0).sort((a, b) => a - b);
  function intensity(amount: number): string {
    if (amount <= 0) return "transparent";
    if (spendAmounts.length === 0) return "hsl(var(--positive))";
    const pct = spendAmounts.filter((a) => a <= amount).length / spendAmounts.length; // 0..1
    if (pct > 0.85) return "hsl(var(--negative))";
    if (pct > 0.6) return "hsl(var(--warning))";
    if (pct > 0.35) return "hsl(45 90% 55%)";
    return "hsl(var(--positive))";
  }

  return (
    <Card className="flex h-full flex-col" data-testid="calendar">
      <CardHeader label="Daily spend" />
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
        {WEEKDAYS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <TooltipProvider delayDuration={120}>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <span key={`pad-${i}`} />
        ))}
        {days.map((d) => {
          const iso = `${month}-${String(d.day).padStart(2, "0")}`;
          return (
            <Tooltip key={d.day}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "flex aspect-square cursor-default flex-col items-center justify-center rounded-lg glass-inset text-[11px]",
                    "transition-colors duration-150 hover:bg-[hsl(var(--muted)/0.85)] hover:ring-1 hover:ring-primary/40",
                  )}
                >
                  <span className="tnum text-muted-foreground">{d.day}</span>
                  <span className="mt-0.5 size-1.5 rounded-full" style={{ backgroundColor: intensity(d.amount) }} />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-medium">{dayLabel(iso)}</p>
                <p className="tnum text-muted-foreground">
                  {d.amount > 0 ? formatSEKAbs(d.amount, masked) : "No spend"}
                </p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      </TooltipProvider>
      {size !== "small" && busiest.day > 0 && (
        <p className="tnum mt-3 text-[11px] text-muted-foreground">
          Busiest: day {busiest.day} · {formatSEKAbs(busiest.amount, masked)} · total {formatSEKAbs(total, masked)}
        </p>
      )}
    </Card>
  );
}
