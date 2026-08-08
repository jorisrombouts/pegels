"use client";

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Card, SectionLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { previewRecategorize, applyRecategorize } from "@/app/actions/recategorize";
import type { RecategorizeChange, RecategorizeScope } from "@/lib/corpus/recategorize";
import { formatSEK } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useData } from "@/store/data";
import type { Category } from "@/lib/domain/types";

const SCOPES: { value: RecategorizeScope; label: string }[] = [
  { value: "needs-review", label: "Ones it wasn't sure about" },
  { value: "uncategorized", label: "Purchases with no category" },
  { value: "all-model", label: "Everything it labelled itself" },
  { value: "all-including-user", label: "Everything, even what I fixed myself" },
];

/**
 * Re-run categorization over rows an older pipeline classified.
 *
 * Preview then apply, and apply sends back exactly the changes that were shown — so what you
 * confirm is what happens, with no second call to the model and no drift in between.
 */
export function RecategorizePanel({ categories }: { categories: Category[] }) {
  const { patchTransactions, tags } = useData();
  const [scope, setScope] = useState<RecategorizeScope>("needs-review");
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [result, setResult] = useState<{ changes: RecategorizeChange[]; unchanged: number; truncated: boolean } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Ids the user has unticked. Absent = applied, so a fresh preview starts with everything on. */
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  const nameOf = (id: string | null) => (id ? categories.find((c) => c.id === id)?.name ?? id : "—");
  const tagNames = (ids: string[]) =>
    ids.map((id) => tags.find((t) => t.id === id)?.name ?? id).join(", ") || "no tags";

  const selected = (result?.changes ?? []).filter((c) => !skipped.has(c.id));
  const toggle = (id: string) =>
    setSkipped((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function runPreview() {
    setBusy("preview");
    setError(null);
    setDone(null);
    setResult(null);
    try {
      setResult(await previewRecategorize(scope));
      setSkipped(new Set()); // a fresh preview starts with every change ticked
    } catch (e) {
      console.error("recategorize preview failed", e);
      setError("Couldn't reach the categorizer. Nothing was changed.");
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    if (!selected.length) return;
    setBusy("apply");
    setError(null);
    try {
      // Only the ticked rows are sent; the unticked ones stay exactly as they are.
      const n = await applyRecategorize(selected);
      // Mirror the server's write into the cache so the list updates without a refetch.
      patchTransactions(
        selected.map((c) => ({
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
      <SectionLabel className="mb-3">Re-label old transactions</SectionLabel>
      <p className="mb-3 text-xs text-muted-foreground">
        Now that it knows more, it can take another look at transactions it labelled earlier.
        Nothing changes until you pick the ones you want.{" "}
        {scope === "all-including-user" ? (
          <span style={{ color: "hsl(var(--warning))" }}>
            This choice also revisits the ones you fixed yourself — check the list carefully.
          </span>
        ) : (
          "The ones you fixed yourself are left alone."
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
            <strong className="tnum">{result.changes.length}</strong> it would change
            <span className="text-muted-foreground">
              {" · "}{result.unchanged} it would leave as they are
              {result.truncated && " · more to come, run this again afterwards"}
            </span>
          </p>

          {result.changes.length > 0 && (
            <>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span className="tnum">{selected.length} of {result.changes.length} ticked</span>
                <button
                  type="button"
                  onClick={() =>
                    setSkipped(
                      selected.length === result.changes.length
                        ? new Set(result.changes.map((c) => c.id))
                        : new Set(),
                    )
                  }
                  className="pressable hover:text-foreground"
                >
                  {selected.length === result.changes.length ? "Untick all" : "Tick all"}
                </button>
              </div>

              <ul className="mt-1 max-h-64 divide-y divide-[hsl(var(--glass-border))] overflow-y-auto">
                {result.changes.map((c) => {
                  // Category alone is not the whole diff — a row can change only its kind or tags,
                  // which used to render as "Mortgage → Mortgage" and look like a no-op.
                  const diffs: { label: string; from: string; to: string }[] = [];
                  if (c.before.categoryId !== c.after.categoryId) {
                    diffs.push({ label: "category", from: nameOf(c.before.categoryId), to: nameOf(c.after.categoryId) });
                  }
                  if (c.before.kind !== c.after.kind) {
                    diffs.push({ label: "type", from: c.before.kind, to: c.after.kind });
                  }
                  if (tagNames(c.before.tagIds) !== tagNames(c.after.tagIds)) {
                    diffs.push({ label: "tags", from: tagNames(c.before.tagIds), to: tagNames(c.after.tagIds) });
                  }
                  const on = !skipped.has(c.id);
                  return (
                    <li key={c.id} className="flex items-start gap-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(c.id)}
                        aria-label={`Change ${c.description}`}
                        className="mt-1 size-4 shrink-0 accent-[hsl(var(--primary))]"
                      />
                      <div className={cn("min-w-0 flex-1", !on && "opacity-40")}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="min-w-0 flex-1 truncate">{c.description}</span>
                          <span className="tnum shrink-0 text-xs text-muted-foreground">{formatSEK(c.amount, false)}</span>
                        </div>
                        {diffs.map((d) => (
                          <p key={d.label} className="text-xs">
                            <span className="text-muted-foreground">{d.label}: {d.from}</span>
                            {" → "}
                            <span className="font-medium">{d.to}</span>
                          </p>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <Button size="sm" onClick={apply} disabled={busy !== null || selected.length === 0} className="mt-3 gap-1.5">
                {busy === "apply" && <Loader2 className="size-4 animate-spin" />}
                Apply {selected.length} change{selected.length === 1 ? "" : "s"}
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
