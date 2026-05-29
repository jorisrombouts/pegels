"use client";

import { useId, useState } from "react";
import { motion } from "motion/react";
import { Card, CardHeader } from "@/components/ui/card";
import { formatSEKAbs, monthLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";
import type { TrendSeries } from "@/lib/domain/selectors";
import type { WidgetSize } from "@/store/ui";

/**
 * 6-month spending trend as a soft area chart, switchable between the Total and
 * each top category via glass chips. At size="small", no month-axis labels.
 */
export function TrendWidget({
  series,
  size = "medium",
  masked = false,
}: {
  series: TrendSeries[];
  size?: WidgetSize;
  masked?: boolean;
}) {
  const gradId = useId();
  const [selectedId, setSelectedId] = useState("total");
  const [hover, setHover] = useState<number | null>(null);
  const active = series.find((s) => s.id === selectedId) ?? series[0];

  const color = active.color === "primary" ? "hsl(var(--primary))" : `hsl(${active.color})`;
  const points = active.points;

  const w = 600;
  const h = size === "large" ? 200 : 120;
  const max = Math.max(...points.map((p) => p.amount), 1);
  const latest = points[points.length - 1]?.amount ?? 0;

  const step = points.length > 1 ? w / (points.length - 1) : w;
  const coords = points.map((p, i) => ({ x: i * step, y: h - (p.amount / max) * (h - 12) - 6 }));
  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const area = `${line} L ${w} ${h} L 0 ${h} Z`;
  const end = coords[coords.length - 1]; // latest point — the moving end-dot

  // Show the hovered month if scrubbing, else the latest.
  const focusIdx = hover ?? points.length - 1;
  const focus = points[focusIdx];
  const focusPct = (coords[focusIdx].x / w) * 100;

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
  }

  return (
    <Card className="flex h-full flex-col" data-testid="trend">
      <CardHeader label="Trend · 6 months" />

      {/* Series chips — glass, horizontally scrollable */}
      <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {series.map((s) => {
          const sel = s.id === active.id;
          const triplet = s.color === "primary" ? "var(--primary)" : s.color;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={cn(
                "pressable flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
                !sel && "glass-inset text-muted-foreground hover:text-foreground",
              )}
              style={sel ? { backgroundColor: `hsl(${triplet} / 0.18)`, color: `hsl(${triplet})` } : undefined}
            >
              {s.icon && <span aria-hidden>{s.icon}</span>}
              {s.label}
            </button>
          );
        })}
      </div>

      <p className="font-display tnum text-2xl font-bold" style={{ color }}>{formatSEKAbs(latest, masked)}</p>
      <p className="mb-3 text-xs text-muted-foreground">
        {active.label} · {monthLabel(points[points.length - 1]?.key ?? "")}
      </p>

      <div className="mt-auto">
        <div className="relative" style={{ height: h }} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Explicit `initial` (the same geometry as `animate`) gives Motion a defined
                start value, so it never animates cx/cy/d from `undefined`; `animate` then
                tweens on series/hover changes. */}
            <motion.path fill={`url(#${gradId})`} initial={{ d: area }} animate={{ d: area }} transition={spring} />
            <motion.path
              fill="none"
              stroke={color}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              initial={{ d: line }}
              animate={{ d: line }}
              transition={spring}
            />
            <motion.circle
              r={4}
              fill={color}
              initial={{ cx: end.x, cy: end.y }}
              animate={{ cx: end.x, cy: end.y }}
              transition={spring}
            />
          </svg>

          {/* Hover crosshair + point + glass tooltip */}
          {hover !== null && focus && (
            <>
              <span className="pointer-events-none absolute top-0 w-px -translate-x-1/2 bg-[hsl(var(--muted-foreground)/0.35)]" style={{ left: `${focusPct}%`, height: h }} />
              <span
                className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[hsl(var(--card))]"
                style={{ left: `${focusPct}%`, top: coords[focusIdx].y, backgroundColor: color }}
              />
              <div
                className={cn(
                  "glass pointer-events-none absolute z-10 -translate-y-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs shadow-lg",
                  focusIdx === 0 ? "translate-x-0" : focusIdx === points.length - 1 ? "-translate-x-full" : "-translate-x-1/2",
                )}
                style={{ left: `${focusPct}%`, top: coords[focusIdx].y - 8 }}
              >
                <p className="font-medium">{monthLabel(focus.key)}</p>
                <p className="tnum text-muted-foreground" style={{ color }}>{formatSEKAbs(focus.amount, masked)}</p>
              </div>
            </>
          )}
        </div>
        {size !== "small" && (
          <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
            {points.map((p, i) => (
              <span key={p.key} className={cn(hover === i && "font-semibold text-foreground")}>{monthLabel(p.key).slice(0, 3)}</span>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
