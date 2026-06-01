"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { formatSEKAbs, formatSignedPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DashCtx } from "./registry";
import type { WidgetSize } from "@/store/ui";
import type { WithDelta } from "@/lib/domain/selectors";

type Mode = "categories" | "tags" | "accounts";
const MODES: { value: Mode; label: string }[] = [
  { value: "categories", label: "Categories" },
  { value: "tags", label: "Tags" },
  { value: "accounts", label: "Accounts" },
];

/** A coloured ↑/↓/→ chip; hidden entirely when there's no prior-period basis. */
function DeltaChip({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const dir = pct > 2 ? "up" : pct < -2 ? "down" : "flat";
  const color = dir === "up" ? "hsl(var(--negative))" : dir === "down" ? "hsl(var(--positive))" : "hsl(var(--muted-foreground))";
  const Icon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : ArrowRight;
  return (
    <span className="tnum inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold" style={{ color }}>
      <Icon className="size-3.5" />
      {formatSignedPct(pct)}
    </span>
  );
}

function SpendBar({
  icon, name, amount, pctOfMax, color, changePct, masked, indent, onBar, onLabel,
}: {
  icon: string; name: string; amount: number; pctOfMax: number; color: string;
  changePct: number | null; masked: boolean; indent?: boolean;
  onBar?: () => void; onLabel?: () => void;
}) {
  return (
    <div className={cn("py-1.5", indent && "pl-5")}>
      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
        <button onClick={onLabel} className="pressable flex min-w-0 items-center gap-2 text-left hover:underline">
          <span className="shrink-0">{icon}</span>
          <span className="truncate">{name}</span>
        </button>
        <span className="flex shrink-0 items-center gap-2">
          <DeltaChip pct={changePct} />
          <span className="tnum text-muted-foreground">{formatSEKAbs(amount, masked)}</span>
        </span>
      </div>
      <button onClick={onBar} className="block w-full" aria-label={`Expand ${name}`}>
        <ProgressBar pct={pctOfMax} color={color} height={6} />
      </button>
    </div>
  );
}

const catColor = (c: { color: string }) => `hsl(${c.color})`;

export function BreakdownWidget({ ctx, size }: { ctx: DashCtx; size: WidgetSize }) {
  const { d, masked, onNavigate } = ctx;
  const [mode, setMode] = useState<Mode>("categories");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const isSmall = size === "small";

  const subRows = useMemo(
    () => (expandedId ? d.subcategoryDeltas(expandedId) : []),
    [expandedId, d],
  );

  let rows: WithDelta<{ id: string; color: string }>[];
  let render: (r: WithDelta<{ id: string; color: string }>) => { icon: string; name: string; href: string };
  let expandable = false;
  if (mode === "tags") {
    rows = d.byTagDelta as never;
    render = (r) => ({ icon: "🏷️", name: (r.item as never as { name: string }).name, href: `/transactions?tag=${r.item.id}` });
  } else if (mode === "accounts") {
    rows = d.byAccountDelta as never;
    render = (r) => ({ icon: (r.item as never as { icon: string }).icon, name: (r.item as never as { name: string }).name, href: `/transactions?account=${r.item.id}` });
  } else {
    rows = d.byCategoryDelta as never;
    render = (r) => ({ icon: (r.item as never as { icon: string }).icon, name: (r.item as never as { name: string }).name, href: `/transactions?category=${r.item.id}` });
    expandable = true;
  }

  const shown = isSmall ? rows.slice(0, 4) : rows;
  const max = rows.reduce((m, r) => Math.max(m, r.amount), 0) || 1;

  const empty = mode === "tags" ? "No tagged spending this month." : "No spending this month.";

  return (
    <Card className="h-full">
      <CardHeader label="Spending breakdown" />

      {!isSmall && (
        <div className="mb-3 flex gap-1 rounded-full glass-inset p-1">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => { setMode(m.value); setExpandedId(null); }}
              className={cn(
                "pressable flex-1 rounded-full px-3 py-1.5 text-xs font-medium",
                mode === m.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="divide-y divide-[hsl(var(--glass-border))]">
          {shown.map((r) => {
            const meta = render(r);
            const expanded = expandable && expandedId === r.item.id;
            return (
              <div key={r.item.id}>
                <SpendBar
                  icon={meta.icon}
                  name={meta.name}
                  amount={r.amount}
                  pctOfMax={r.amount / max}
                  color={catColor(r.item)}
                  changePct={r.changePct}
                  masked={masked}
                  onLabel={() => onNavigate(meta.href)}
                  onBar={expandable && !isSmall ? () => setExpandedId(expanded ? null : r.item.id) : () => onNavigate(meta.href)}
                />
                {expanded && subRows.length > 0 && (
                  <div className="pb-1">
                    {subRows.map((s) => {
                      const subMax = subRows.reduce((m, x) => Math.max(m, x.amount), 0) || 1;
                      return (
                        <SpendBar
                          key={s.item.id}
                          icon={s.item.icon}
                          name={s.item.name}
                          amount={s.amount}
                          pctOfMax={s.amount / subMax}
                          color={catColor(s.item)}
                          changePct={s.changePct}
                          masked={masked}
                          indent
                          onLabel={() => onNavigate(`/transactions?category=${s.item.id}`)}
                          onBar={() => onNavigate(`/transactions?category=${s.item.id}`)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {mode === "tags" && <p className="pt-2 text-[11px] text-muted-foreground">Tags can overlap — totals don’t sum to your monthly spend.</p>}
        </div>
      )}
    </Card>
  );
}
