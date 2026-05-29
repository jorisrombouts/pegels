"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatSEK, formatSEKAbs } from "@/lib/format";
import type { CategorySpend } from "@/lib/domain/selectors";

/** Donut of spend-by-category with the month total in the center (matches the prototype). */
export function CategoryDonut({
  data,
  total,
  masked = false,
  onSlice,
}: {
  data: CategorySpend[];
  total: number;
  masked?: boolean;
  onSlice?: (categoryId: string) => void;
}) {
  const slices = data.map((d) => ({
    id: d.category.id,
    name: d.category.name,
    icon: d.category.icon,
    value: d.amount,
    color: `hsl(${d.category.color})`,
  }));

  return (
    <div className="relative" style={{ height: 200 }} data-testid="category-donut">
      {/* Numeric height (matches the fixed 200px box) so Recharts has a real dimension on its
          first, pre-measurement render — avoids the width(-1)/height(-1) console warning. */}
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius="64%"
            outerRadius="92%"
            paddingAngle={2}
            stroke="none"
            startAngle={90}
            endAngle={-270}
            isAnimationActive
            onClick={onSlice ? (_, i) => onSlice(slices[i].id) : undefined}
            className={onSlice ? "cursor-pointer" : undefined}
          >
            {slices.map((s) => (
              <Cell key={s.id} fill={s.color} />
            ))}
          </Pie>
          <Tooltip
            cursor={false}
            isAnimationActive={false}
            content={({ active, payload }) => <DonutTooltip active={active} payload={payload} total={total} masked={masked} />}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <span className="font-display tnum text-xl font-bold">{formatSEK(-total, masked)}</span>
      </div>
    </div>
  );
}

interface DonutTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: { name: string; icon: string; value: number; color: string } }>;
  total: number;
  masked: boolean;
}

function DonutTooltip({ active, payload, total, masked }: DonutTooltipProps) {
  const slice = payload?.[0]?.payload;
  if (!active || !slice) return null;
  const pct = total > 0 ? Math.round((slice.value / total) * 100) : 0;
  return (
    <div className="glass rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="flex items-center gap-1.5 font-medium">
        <span className="size-2 rounded-full" style={{ backgroundColor: slice.color }} />
        {slice.icon} {slice.name}
      </p>
      <p className="tnum mt-0.5 text-muted-foreground">
        {formatSEKAbs(slice.value, masked)} · {pct}%
      </p>
    </div>
  );
}
