"use client";

import { useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, SectionLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CandidateQueue } from "@/components/training/candidate-queue";
import { CorpusTable } from "@/components/training/corpus-table";
import { RecategorizePanel } from "@/components/training/recategorize-panel";
import { useCorpus } from "@/store/corpus";
import { useData } from "@/store/data";

/**
 * What the categorizer has learned, and the place to steer it.
 *
 * Retrieval only fires on *approved* merchants, so the review queue is the highest-leverage
 * surface in the app — every approval widens the evidence the next import gets to reason from.
 */
export default function TrainingPage() {
  const { rows, isLoading, approve, reject, toggleGold, remove, edit, backfill } = useCorpus();
  const { categories, tags } = useData();
  const [backfilling, setBackfilling] = useState(false);
  const [report, setReport] = useState<string | null>(null);

  const { candidates, approved } = useMemo(
    () => ({
      candidates: rows.filter((r) => r.status === "candidate"),
      approved: rows.filter((r) => r.status === "approved"),
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
      setReport(`${r.considered} hand-corrected transactions → ${r.merchants} merchants.`);
    } catch {
      setReport("Backfill failed — check the server logs.");
    } finally {
      setBackfilling(false);
    }
  }

  return (
    <>
      <PageHeader title="Training" subtitle="What the categorizer has learned" />

      {/* Narrow single column on phones; on desktop the queue and the corpus sit side by side so
          reviewing doesn't mean scrolling past everything already learned. */}
      <div className="mx-auto max-w-2xl space-y-4 lg:max-w-none">
        <Card>
          <SectionLabel className="mb-3">Corpus</SectionLabel>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Approved" value={approved.length} sub="used for retrieval" />
            <Stat label="Awaiting review" value={candidates.length} sub="not yet evidence" />
            <Stat label="Sightings" value={sightings} sub="transactions behind them" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Only approved merchants are retrieved. {tagged === 0
              ? "None carry tags yet, so tag predictions still come from the prompt alone."
              : `${tagged} carry tags, which is what teaches tag prediction.`}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <Button variant="glass" size="sm" onClick={runBackfill} disabled={backfilling} className="gap-1.5">
              {backfilling ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Seed from my corrections
            </Button>
            {report && <span className="text-xs text-muted-foreground">{report}</span>}
          </div>
        </Card>

        {isLoading ? (
          <Card>
            <p className="py-6 text-center text-sm text-muted-foreground">Loading the corpus…</p>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            <CandidateQueue
              rows={candidates}
              categories={categories}
              onApprove={approve}
              onReject={reject}
            />
            <div className="grid gap-4">
              <RecategorizePanel categories={categories} />
              <CorpusTable
                rows={approved}
                categories={categories}
                tags={tags}
                onToggleGold={toggleGold}
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
