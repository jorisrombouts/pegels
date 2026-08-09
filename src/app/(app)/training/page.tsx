"use client";

import { useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, SectionLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CandidateQueue } from "@/components/training/candidate-queue";
import { CorpusTable } from "@/components/training/corpus-table";
import { DismissedList } from "@/components/training/dismissed-list";
import { AccuracyCard } from "@/components/training/accuracy-card";
import { RecategorizePanel } from "@/components/training/recategorize-panel";
import { useCorpus } from "@/store/corpus";
import { useData } from "@/store/data";

/**
 * What the categorizer has learned, and where to steer it.
 *
 * Retrieval only fires on *approved* names, so the review queue is the highest-leverage
 * surface in the app — every approval widens the evidence the next import gets to reason from.
 */
export default function TrainingPage() {
  const { rows, isLoading, approve, reject, restore, remove, edit, backfill } = useCorpus();
  const { categories, tags } = useData();
  const [backfilling, setBackfilling] = useState(false);
  const [report, setReport] = useState<string | null>(null);

  const { candidates, approved, dismissed } = useMemo(
    () => ({
      candidates: rows.filter((r) => r.status === "candidate"),
      approved: rows.filter((r) => r.status === "approved"),
      dismissed: rows.filter((r) => r.status === "rejected"),
    }),
    [rows],
  );

  const sightings = approved.reduce((s, r) => s + r.hitCount, 0);
  const tagged = approved.filter((r) => r.finalTagIds.length > 0).length;

  async function runBackfill() {
    setBackfilling(true);
    setReport(null);
    try {
      const r = await backfill(false);
      setReport(`Read ${r.considered} transaction${r.considered === 1 ? "" : "s"} you had fixed yourself, and learned ${r.merchants} name${r.merchants === 1 ? "" : "s"} from them.`);
    } catch {
      setReport("Something went wrong — nothing was changed.");
    } finally {
      setBackfilling(false);
    }
  }

  return (
    <>
      <PageHeader title="Teach" subtitle="What it can label on its own, and what it still needs from you" />

      {/* Narrow single column on phones; on desktop the queue and the corpus sit side by side so
          reviewing doesn't mean scrolling past everything already learned. */}
      <div className="mx-auto max-w-2xl space-y-4 lg:max-w-none">
        <Card>
          <SectionLabel className="mb-3">What it has learned</SectionLabel>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Recognises" value={approved.length} sub="names it can label on its own" />
            <Stat label="Needs a check" value={candidates.length} sub="not used until you confirm" />
            <Stat label="Transactions" value={sightings} sub="it has learned from" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            A name only helps once you confirm it. {tagged === 0
              ? "None of them have tags yet, so it has to guess tags from scratch every time."
              : `${tagged} of them have tags, which is how it learns to tag new purchases.`}
          </p>
          <div className="mt-4 rounded-2xl glass-inset px-3 py-3">
            <p className="text-xs text-muted-foreground">
              Goes back through every transaction you categorised yourself and learns those names.
              Safe to run more than once — it updates what it already knows instead of duplicating it.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Button variant="glass" size="sm" onClick={runBackfill} disabled={backfilling} className="gap-1.5">
                {backfilling ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Learn from my past edits
              </Button>
              {report && <span className="text-xs text-muted-foreground">{report}</span>}
            </div>
          </div>
        </Card>

        {isLoading ? (
          <Card>
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            <div className="grid gap-4">
              <CandidateQueue
                rows={candidates}
                categories={categories}
                onApprove={approve}
                onReject={reject}
              />
              <DismissedList rows={dismissed} onRestore={restore} />
            </div>
            <div className="grid gap-4">
              <AccuracyCard />
              <RecategorizePanel categories={categories} />
              <CorpusTable
                rows={approved}
                categories={categories}
                tags={tags}
                onRemove={remove}
                onEdit={edit}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="rounded-2xl glass-inset px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-display tnum mt-0.5 text-2xl font-bold">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}
