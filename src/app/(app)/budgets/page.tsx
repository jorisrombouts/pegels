"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useShallow } from "zustand/react/shallow";
import { Plus, Target } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BudgetEditor } from "@/components/budgets/budget-editor";
import { useData } from "@/store/data";
import { useUI } from "@/store/ui";
import { useMediaQuery } from "@/lib/use-media-query";
import { spring } from "@/lib/motion";
import { MonthSwitcher } from "@/components/month-switcher";
import { buildMaps, type BudgetHealth } from "@/lib/domain/selectors";
import { budgetForecasts } from "@/lib/forecast/budget-forecast";
import { formatSEKAbs } from "@/lib/format";
import { cn } from "@/lib/utils";

const healthColor: Record<BudgetHealth, string> = {
  under: "hsl(var(--primary))",
  warning: "hsl(var(--warning))",
  over: "hsl(var(--negative))",
};

export default function BudgetsPage() {
  const data = useData();
  // Scoped pick so opening modals (importOpen/quickAddOpen) doesn't re-render this page.
  const { month, masked } = useUI(useShallow((s) => ({ month: s.month, masked: s.masked })));
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // The dataset slices are referentially stable across renders (TanStack Query structural sharing),
  // so memoizing on them skips these full-transaction scans — four per budget on an in-progress
  // month — when only local state changes, i.e. on every tap of a budget row.
  const { transactions, categories, budgets } = data;
  const maps = useMemo(() => buildMaps(categories), [categories]);
  const statuses = useMemo(
    () => budgetForecasts(budgets, transactions, maps, month),
    [budgets, transactions, maps, month],
  );
  const totalSpent = statuses.reduce((s, b) => s + b.spent, 0);
  const totalLimit = statuses.reduce((s, b) => s + b.limit, 0);
  const overallPct = totalLimit > 0 ? totalSpent / totalLimit : 0;
  const anyProjected = statuses.some((b) => b.isProjected);
  const projectedTotal = statuses.reduce((s, b) => s + b.projected, 0);

  const selectedBudget = selectedId && selectedId !== "new" ? budgets.find((b) => b.id === selectedId) ?? null : null;

  const editor = <BudgetEditor key={selectedId} budget={selectedBudget} month={month} onClose={() => setSelectedId(null)} />;

  return (
    <>
      <PageHeader title="Budgets" />

      {/* Month + overall */}
      <div className="mb-4 space-y-2">
        {/* Stack on mobile so the MonthSwitcher's "This month" button (off the current month) doesn't
            collide with the overall %; side-by-side from sm: up. */}
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <MonthSwitcher suffix={statuses.length} />
          <span className="tnum text-sm text-muted-foreground">{Math.round(overallPct * 100)}%</span>
        </div>
        <p className="tnum text-xs text-muted-foreground">
          Spent {formatSEKAbs(totalSpent, masked)} of {formatSEKAbs(totalLimit, masked)}
        </p>
        {anyProjected && (
          <p className="tnum text-xs text-muted-foreground">
            Projected {formatSEKAbs(projectedTotal, masked)} of {formatSEKAbs(totalLimit, masked)}
          </p>
        )}
        <ProgressBar pct={overallPct} color={overallPct >= 1 ? "hsl(var(--negative))" : "hsl(var(--primary))"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(360px,400px)]">
        {/* List */}
        <div className="space-y-2">
          {statuses.map((b) => {
            const parent = b.category?.parentId ? maps.categoryById.get(b.category.parentId) : undefined;
            return (
              <button
                key={b.budget.id}
                onClick={() => setSelectedId(b.budget.id)}
                className={cn(
                  "pressable block w-full rounded-glass glass p-4 text-left",
                  isDesktop && selectedId === b.budget.id && "ring-1 ring-primary/50",
                )}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0">{b.category?.icon}</span>
                    <span className="truncate font-medium">{b.category?.name}</span>
                    {parent && <span className="shrink-0 text-xs text-muted-foreground">↳ {parent.icon} {parent.name}</span>}
                  </span>
                  <span className="tnum shrink-0 text-sm text-muted-foreground">
                    {formatSEKAbs(b.spent, masked)} / {formatSEKAbs(b.limit, masked)}
                  </span>
                </div>
                <ProgressBar pct={b.pct} color={healthColor[b.health]} height={6} />
                {b.isProjected && (
                  <p className="mt-2 text-xs font-medium" style={{ color: healthColor[b.forecastHealth] }}>
                    {b.forecastHealth === "over" ? (
                      <>Trending over by <span className="tnum">{formatSEKAbs(b.overBy, masked)}</span></>
                    ) : b.forecastHealth === "warning" ? (
                      "Nearing limit"
                    ) : (
                      "On track"
                    )}
                  </p>
                )}
              </button>
            );
          })}

          <button
            onClick={() => setSelectedId("new")}
            className="pressable flex w-full items-center justify-center gap-2 rounded-glass glass-inset p-4 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-4" /> New budget
          </button>
        </div>

        {/* Desktop editor */}
        <Card className="hidden h-fit lg:sticky lg:top-6 lg:block">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={selectedId ?? "empty"}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={spring}
            >
              {selectedId ? editor : <EditorEmpty onNew={() => setSelectedId("new")} />}
            </motion.div>
          </AnimatePresence>
        </Card>
      </div>

      {/* Mobile sheet */}
      <Dialog open={!isDesktop && selectedId !== null} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent title={selectedBudget ? "Edit budget" : "New budget"}>{editor}</DialogContent>
      </Dialog>
    </>
  );
}

function EditorEmpty({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <Target className="size-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Pick a budget to edit, or create a new one.</p>
      <Button size="sm" variant="glass" onClick={onNew} className="gap-1.5">
        <Plus className="size-4" /> New budget
      </Button>
    </div>
  );
}
