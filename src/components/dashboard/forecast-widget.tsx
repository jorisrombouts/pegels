"use client";

import { AlertTriangle } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { formatSEKAbs } from "@/lib/format";
import type { CategoryForecast, ForecastVerdict } from "@/lib/forecast/category-forecast";
import { cn } from "@/lib/utils";

const VERDICT: Record<ForecastVerdict, { label: string; color: string } | null> = {
  "trending-over": { label: "Trending over", color: "hsl(var(--negative))" },
  "on-track": { label: "On track", color: "hsl(var(--positive))" },
  settled: { label: "Fixed", color: "hsl(var(--muted-foreground))" },
  "no-basis": { label: "Too early to say", color: "hsl(var(--muted-foreground))" },
};

/**
 * "Where you'll land, per category" — the answer to *do I need to adjust?*
 *
 * Each row pairs the projection with a typical month, then says what to do about it: a daily
 * allowance where spending is steerable, and nothing where it isn't (rent must never suggest
 * you spend 400/day less on rent).
 */
export function ForecastWidget({
  rows,
  masked,
  onNavigate,
}: {
  rows: CategoryForecast[];
  masked: boolean;
  onNavigate: (href: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader label="Where you'll land" />
        <p className="py-6 text-center text-sm text-muted-foreground">
          Not enough history yet — import another month to see where your spending is heading.
        </p>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader label="Where you'll land" />
      <div className="divide-y divide-[hsl(var(--glass-border))]">
        {rows.map((r) => {
          const verdict = VERDICT[r.verdict];
          const over = r.verdict === "trending-over";
          return (
            <button
              key={r.category.id}
              onClick={() => onNavigate(`/transactions?category=${r.category.id}`)}
              className="pressable block w-full py-2.5 text-left first:pt-0 last:pb-0"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                  <span className="shrink-0">{r.category.icon}</span>
                  <span className="truncate">{r.category.name}</span>
                </span>
                <span
                  className="tnum shrink-0 font-display text-base font-bold"
                  style={over ? { color: "hsl(var(--negative))" } : undefined}
                >
                  {formatSEKAbs(r.projected, masked)}
                </span>
              </div>

              <div className="mt-0.5 flex items-baseline justify-between gap-3 text-xs">
                <span className="truncate" style={{ color: verdict?.color }}>
                  {verdict?.label}
                  {r.baseline !== null && (
                    <span className="tnum text-muted-foreground">
                      {" · usually "}
                      {formatSEKAbs(r.baseline, masked)}
                    </span>
                  )}
                </span>
                {r.dailyAllowance !== null && (
                  <span className="tnum shrink-0 text-muted-foreground">
                    {formatSEKAbs(r.dailyAllowance, masked)}
                    <span>/day left</span>
                  </span>
                )}
              </div>

              {r.recurringLate.length > 0 && (
                <p className={cn("mt-1 flex items-center gap-1 text-[11px]", "text-[hsl(var(--warning))]")}>
                  <AlertTriangle className="size-3 shrink-0" />
                  <span className="truncate">
                    {r.recurringLate.map((c) => c.label).join(", ")} hasn&apos;t landed yet — still counted
                  </span>
                </p>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
