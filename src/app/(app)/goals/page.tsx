"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Plus, Target } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { GoalEditor } from "@/components/goals/goal-editor";
import { useData } from "@/store/data";
import { useUI } from "@/store/ui";
import { useMediaQuery } from "@/lib/use-media-query";
import { spring } from "@/lib/motion";
import { goalProgress } from "@/lib/domain/selectors";
import { formatSEKAbs } from "@/lib/format";
import { cn } from "@/lib/utils";

function deadlineLabel(daysLeft: number | null): { text: string; overdue: boolean } | null {
  if (daysLeft === null) return null;
  if (daysLeft < 0) return { text: `${Math.abs(daysLeft)}d overdue`, overdue: true };
  return { text: `${daysLeft}d left`, overdue: false };
}

export default function GoalsPage() {
  return (
    <Suspense fallback={null}>
      <GoalsRoute />
    </Suspense>
  );
}

function GoalsRoute() {
  // Deep-link: ?goal=<id> preselects a goal (from the dashboard Goals widget).
  const params = useSearchParams();
  return <GoalsView key={params.toString()} initialGoalId={params.get("goal")} />;
}

function GoalsView({ initialGoalId }: { initialGoalId: string | null }) {
  const data = useData();
  const masked = useUI((s) => s.masked);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [selectedId, setSelectedId] = useState<string | null>(initialGoalId);

  const progress = data.goals.map((g) => goalProgress(g, data.transactions));
  const totalSaved = progress.reduce((s, p) => s + p.saved, 0);
  const totalTarget = progress.reduce((s, p) => s + p.goal.target, 0);
  const overallPct = totalTarget > 0 ? totalSaved / totalTarget : 0;

  const selectedGoal = selectedId && selectedId !== "new" ? data.goals.find((g) => g.id === selectedId) ?? null : null;
  const editor = <GoalEditor key={selectedId} goal={selectedGoal} onClose={() => setSelectedId(null)} />;

  return (
    <>
      <PageHeader title="Savings Goals" />

      {/* Overall */}
      <div className="mb-4 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="tnum text-muted-foreground">
            Saved {formatSEKAbs(totalSaved, masked)} of {formatSEKAbs(totalTarget, masked)}
          </span>
          <span className="tnum text-muted-foreground">{Math.round(overallPct * 100)}%</span>
        </div>
        <ProgressBar pct={overallPct} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(360px,400px)]">
        {/* List */}
        <div className="space-y-2">
          {progress.map((p) => {
            const dl = deadlineLabel(p.daysLeft);
            return (
              <button
                key={p.goal.id}
                onClick={() => setSelectedId(p.goal.id)}
                className={cn(
                  "pressable block w-full rounded-glass glass p-4 text-left",
                  isDesktop && selectedId === p.goal.id && "ring-1 ring-primary/50",
                )}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0">{p.goal.icon}</span>
                    <span className="truncate font-medium">{p.goal.name}</span>
                  </span>
                  <span className="tnum shrink-0 text-sm text-muted-foreground">
                    {formatSEKAbs(p.saved, masked)} / {formatSEKAbs(p.goal.target, masked)}
                  </span>
                </div>
                <ProgressBar pct={p.pct} />
                <div className="mt-1.5 flex items-center justify-between text-xs">
                  {dl ? (
                    <span style={{ color: dl.overdue ? "hsl(var(--negative))" : undefined }} className={cn(!dl.overdue && "text-muted-foreground")}>
                      {dl.text}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">No deadline</span>
                  )}
                  <span className="tnum text-muted-foreground">{Math.round(p.pct * 100)}%</span>
                </div>
              </button>
            );
          })}

          <button
            onClick={() => setSelectedId("new")}
            className="pressable flex w-full items-center justify-center gap-2 rounded-glass glass-inset p-4 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-4" /> New goal
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
        <DialogContent title={selectedGoal ? "Edit goal" : "New goal"}>{editor}</DialogContent>
      </Dialog>
    </>
  );
}

function EditorEmpty({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <Target className="size-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Pick a goal to edit, or create a new one.</p>
      <Button size="sm" variant="glass" onClick={onNew} className="gap-1.5">
        <Plus className="size-4" /> New goal
      </Button>
    </div>
  );
}
