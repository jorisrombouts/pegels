"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { orderCategories } from "@/lib/domain/selectors";
import { formatSEKAbs } from "@/lib/format";
import type { CurationRow } from "@/lib/corpus/types";
import type { Category } from "@/lib/domain/types";
import type { CorpusEdit } from "@/store/corpus";

const NONE = "__none__";

/**
 * Unreviewed merchants, most-seen first.
 *
 * The ordering is the whole point: approving the merchant you've seen 47 times buys far more
 * future accuracy than one seen once, so a minute spent at the top of this list is worth more
 * than a minute anywhere else in the app.
 */
export function CandidateQueue({
  rows,
  categories,
  onApprove,
  onReject,
}: {
  rows: CurationRow[];
  categories: Category[];
  onApprove: (id: string, edit?: CorpusEdit) => void;
  onReject: (id: string) => void;
}) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const ordered = orderCategories(categories);
  const nameOf = new Map(categories.map((c) => [c.id, c]));

  return (
    <Card>
      <CardHeader
        label="Needs review"
        action={<span className="tnum text-xs text-muted-foreground">{rows.length} merchants</span>}
      />
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nothing waiting — every merchant the AI has seen is either approved or dismissed.
        </p>
      ) : (
        <ul className="divide-y divide-[hsl(var(--glass-border))]">
          {rows.map((r) => {
            const chosen = edits[r.id] ?? r.finalCategoryId ?? NONE;
            const current = chosen === NONE ? null : nameOf.get(chosen);
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-2.5 first:pt-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.cleanedDescription}</p>
                  <p className="tnum text-xs text-muted-foreground">
                    seen {r.hitCount}×
                    {r.finalKind !== "expense" && ` · ${r.finalKind}`}
                    {` · ~${formatSEKAbs(Math.abs(r.amount), false)}`}
                  </p>
                </div>

                <Select value={chosen} onValueChange={(v) => setEdits((e) => ({ ...e, [r.id]: v }))}>
                  <SelectTrigger className="w-44 shrink-0">
                    <SelectValue placeholder="Uncategorized">
                      {current ? `${current.icon} ${current.name}` : "Uncategorized"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Uncategorized</SelectItem>
                    {ordered.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.parentId ? "↳ " : ""}
                        {c.icon} {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label={`Approve ${r.cleanedDescription}`}
                    onClick={() => onApprove(r.id, { finalCategoryId: chosen === NONE ? null : chosen })}
                    className="pressable grid size-8 place-items-center rounded-full"
                    style={{ backgroundColor: "hsl(var(--positive) / 0.15)", color: "hsl(var(--positive))" }}
                  >
                    <Check className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Dismiss ${r.cleanedDescription}`}
                    onClick={() => onReject(r.id)}
                    className="pressable grid size-8 place-items-center rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
