"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronRight } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { formatSEKAbs, formatSignedPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DashCtx } from "./registry";
import type { WidgetSize } from "@/store/ui";

type Mode = "categories" | "tags" | "accounts";
const MODES: { value: Mode; label: string }[] = [
  { value: "categories", label: "Categories" },
  { value: "tags", label: "Tags" },
  { value: "accounts", label: "Accounts" },
];

/** A normalized row — every mode/level maps to this shape so rendering is uniform. */
interface Row {
  id: string;
  icon: string;
  name: string;
  color: string; // ready-to-use CSS color
  amount: number;
  changePct: number | null;
  href: string; // filtered Transactions deep-link
}

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

/**
 * One bar row. Single tap target: an expandable row toggles its children (chevron
 * rotates); a leaf row deep-links to its filtered transactions.
 */
function SpendBar({
  row, pctOfMax, masked, indent, expandable, expanded, onClick,
}: {
  row: Row; pctOfMax: number; masked: boolean; indent?: boolean;
  expandable?: boolean; expanded?: boolean; onClick: () => void;
}) {
  const label = expandable ? (expanded ? `Collapse ${row.name}` : `Expand ${row.name}`) : `View ${row.name} transactions`;
  return (
    <div className={cn("py-1.5", indent && "pl-5")}>
      <button onClick={onClick} aria-label={label} aria-expanded={expandable ? !!expanded : undefined} className="pressable block w-full text-left">
        <div className="mb-1 flex items-center justify-between gap-2 text-sm">
          <span className="flex min-w-0 items-center gap-1.5">
            {expandable && <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />}
            <span className="shrink-0">{row.icon}</span>
            <span className="truncate">{row.name}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <DeltaChip pct={row.changePct} />
            <span className="tnum text-muted-foreground">{formatSEKAbs(row.amount, masked)}</span>
          </span>
        </div>
        <ProgressBar pct={pctOfMax} color={row.color} height={6} />
      </button>
    </div>
  );
}

/** Map the active mode's delta rows to the uniform Row shape (no casts). */
function rowsForMode(mode: Mode, d: DashCtx["d"]): Row[] {
  if (mode === "tags") {
    return d.byTagDelta.map((r) => ({
      id: r.item.id, icon: "🏷️", name: r.item.name, color: `hsl(${r.item.color})`,
      amount: r.amount, changePct: r.changePct, href: `/transactions?tag=${r.item.id}`,
    }));
  }
  if (mode === "accounts") {
    return d.byAccountDelta.map((r) => ({
      id: r.item.id, icon: r.item.icon, name: r.item.name, color: `hsl(${r.item.color})`,
      amount: r.amount, changePct: r.changePct, href: `/transactions?account=${r.item.id}`,
    }));
  }
  return d.byCategoryDelta.map((r) => ({
    id: r.item.id, icon: r.item.icon, name: r.item.name, color: `hsl(${r.item.color})`,
    amount: r.amount, changePct: r.changePct, href: `/transactions?category=${r.item.id}`,
  }));
}

/** Subcategory rows for a parent; the parent-direct bucket (same id) shows as "Other". */
function subRowsFor(parentId: string, d: DashCtx["d"]): Row[] {
  return d.subcategoryDeltas(parentId).map((s) => {
    const isParentDirect = s.item.id === parentId;
    return {
      id: s.item.id,
      icon: isParentDirect ? "•" : s.item.icon,
      name: isParentDirect ? "Other" : s.item.name,
      color: `hsl(${s.item.color})`,
      amount: s.amount,
      changePct: s.changePct,
      href: `/transactions?category=${s.item.id}`,
    };
  });
}

export function BreakdownWidget({ ctx, size }: { ctx: DashCtx; size: WidgetSize }) {
  const { d, masked, onNavigate } = ctx;
  const [mode, setMode] = useState<Mode>("categories");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const isSmall = size === "small";

  const rows = useMemo(() => rowsForMode(mode, d), [mode, d]);

  // Precompute each category's children once, so we know which rows get a chevron.
  // A category is expandable only when it has a real subcategory with spend (a child
  // distinct from the parent-direct "Other" bucket).
  const subByParent = useMemo(() => {
    const map = new Map<string, Row[]>();
    if (mode === "categories" && !isSmall) {
      for (const r of rows) {
        const subs = subRowsFor(r.id, d);
        if (subs.some((s) => s.id !== r.id)) map.set(r.id, subs);
      }
    }
    return map;
  }, [mode, isSmall, rows, d]);

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
            const subs = subByParent.get(r.id);
            const expandable = subs !== undefined;
            const expanded = expandable && expandedId === r.id;
            const subMax = subs ? subs.reduce((m, x) => Math.max(m, x.amount), 0) || 1 : 1;
            return (
              <div key={r.id}>
                <SpendBar
                  row={r}
                  pctOfMax={r.amount / max}
                  masked={masked}
                  expandable={expandable}
                  expanded={expanded}
                  onClick={() => (expandable ? setExpandedId(expanded ? null : r.id) : onNavigate(r.href))}
                />
                {expanded && subs && (
                  <div className="pb-1">
                    {subs.map((s) => (
                      <SpendBar key={s.id} row={s} pctOfMax={s.amount / subMax} masked={masked} indent onClick={() => onNavigate(s.href)} />
                    ))}
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
