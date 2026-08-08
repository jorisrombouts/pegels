"use client";

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Card, SectionLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { previewRecategorize, applyRecategorize } from "@/app/actions/recategorize";
import type { RecategorizeChange, RecategorizeScope } from "@/lib/corpus/recategorize";
import { formatSEK } from "@/lib/format";
import { useData } from "@/store/data";
import type { Category } from "@/lib/domain/types";

const SCOPES: { value: RecategorizeScope; label: string }[] = [
  { value: "needs-review", label: "Flagged for review" },
  { value: "uncategorized", label: "Uncategorized expenses" },
  { value: "all-model", label: "Everything the AI categorized" },
  { value: "all-including-user", label: "Everything, including my corrections" },
];

/**
 * Re-run categorization over rows an older pipeline classified.
 *
 * Preview then apply, and apply sends back exactly the changes that were shown — so what you
 * confirm is what happens, with no second call to the model and no drift in between.
 */
export function RecategorizePanel({ categories }: { categories: Category[] }) {
  const { patchTransactions } = useData();
  const [scope, setScope] = useState<RecategorizeScope>("needs-review");
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [result, setResult] = useState<{ changes: RecategorizeChange[]; unchanged: number; truncated: boolean } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nameOf = (id: string | null) => (id ? categories.find((c) => c.id === id)?.name ?? id : "—");

  async function runPreview() {
    setBusy("preview");
    setError(null);
    setDone(null);
    setResult(null);
    try {
      setResult(await previewRecategorize(scope));
    } catch (e) {
      console.error("recategorize preview failed", e);
      setError("Couldn't reach the AI service. Nothing was changed.");
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    if (!result?.changes.length) return;
    setBusy("apply");
    setError(null);
    try {
      const n = await applyRecategorize(result.changes);
      // Mirror the server's write into the cache so the list updates without a refetch.
      patchTransactions(
        result.changes.map((c) => ({
          id: c.id,
          patch: { kind: c.after.kind, categoryId: c.after.categoryId, tagIds: c.after.tagIds },
        })),
      );
      setDone(`Updated ${n} transaction${n === 1 ? "" : "s"}.`);
      setResult(null);
    } catch (e) {
      console.error("recategorize apply failed", e);
      setError("Couldn't save the changes.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <SectionLabel className="mb-3">Re-categorize</SectionLabel>
      <p className="mb-3 text-xs text-muted-foreground">
        Runs the current categorizer over transactions an older version classified.{" "}
        {scope === "all-including-user" ? (
          <span style={{ color: "hsl(var(--warning))" }}>
            This scope also revisits the ones you corrected by hand — review the preview before
            applying.
          </span>
        ) : (
          "Anything you corrected by hand is left alone."
        )}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={scope} onValueChange={(v) => setScope(v as RecategorizeScope)}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCOPES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="glass" size="sm" onClick={runPreview} disabled={busy !== null} className="gap-1.5">
          {busy === "preview" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Preview
        </Button>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-xl px-3 py-2 text-sm" style={{ backgroundColor: "hsl(var(--negative) / 0.12)", color: "hsl(var(--negative))" }}>
          {error}
        </p>
      )}
      {done && <p className="mt-3 text-sm text-muted-foreground">{done}</p>}

      {result && (
        <div className="mt-4">
          <p className="text-sm">
            <strong className="tnum">{result.changes.length}</strong> would change
            <span className="text-muted-foreground">
              {" · "}{result.unchanged} already agree
              {result.truncated && " · more remain, run again after applying"}
            </span>
          </p>

          {result.changes.length > 0 && (
            <>
              <ul className="mt-2 max-h-64 divide-y divide-[hsl(var(--glass-border))] overflow-y-auto">
                {result.changes.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{c.description}</span>
                    <span className="tnum shrink-0 text-xs text-muted-foreground">{formatSEK(c.amount, false)}</span>
                    <span className="shrink-0 text-xs">
                      <span className="text-muted-foreground">{nameOf(c.before.categoryId)}</span>
                      {" → "}
                      <span className="font-medium">{nameOf(c.after.categoryId)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <Button size="sm" onClick={apply} disabled={busy !== null} className="mt-3 gap-1.5">
                {busy === "apply" && <Loader2 className="size-4 animate-spin" />}
                Apply {result.changes.length} change{result.changes.length === 1 ? "" : "s"}
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
