"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { EvidenceEditor } from "./evidence-editor";
import { formatSEKAbs } from "@/lib/format";
import type { CurationRow } from "@/lib/corpus/types";
import type { Category } from "@/lib/domain/types";
import type { CorpusEdit } from "@/store/corpus";
import { paginate } from "@/lib/paginate";
import { Pager } from "@/components/ui/pager";

const NONE = "__none__";
/** Small enough that the top of the queue stays the point, rather than a wall of rows. */
const PAGE_SIZE = 20;

/**
 * Names not yet reviewed, the ones on most transactions first.
 *
 * The ordering is the whole point: approving the name you've seen on 47 transactions buys far more
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
  // Pending edits per row, applied on approve. Category, kind and tags are all part of the evidence
  // a name contributes, so all three are editable before it becomes retrievable.
  const [edits, setEdits] = useState<Record<string, CorpusEdit>>({});
  const [page, setPage] = useState(0);
  const patch = (id: string, p: CorpusEdit) => setEdits((e) => ({ ...e, [id]: { ...e[id], ...p } }));
  // Rows leave this list as they're approved, so the page can shrink out from under the user;
  // paginate clamps rather than showing an empty page.
  const shown = paginate(rows, page, PAGE_SIZE);

  return (
    <Card>
      <CardHeader
        label="Check these"
        action={<span className="tnum text-xs text-muted-foreground">{rows.length} to go</span>}
      />
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          All caught up. Every name it has seen is either confirmed or hidden.
        </p>
      ) : (
        <ul className="divide-y divide-[hsl(var(--glass-border))]">
          {shown.rows.map((r) => {
            const edit = edits[r.id] ?? {};
            const chosen = edit.finalCategoryId === undefined ? r.finalCategoryId ?? NONE : edit.finalCategoryId ?? NONE;
            const kind = edit.finalKind ?? r.finalKind;
            const tagIds = edit.finalTagIds ?? r.finalTagIds;
            return (
              <li key={r.id} className="py-2.5 first:pt-0">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.cleanedDescription}</p>
                    <p className="tnum text-xs text-muted-foreground">
                      {r.hitCount} transaction{r.hitCount === 1 ? "" : "s"}{` · about ${formatSEKAbs(Math.abs(r.amount), false)} each`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      aria-label={`Approve ${r.cleanedDescription}`}
                      onClick={() =>
                        onApprove(r.id, { ...edit, finalCategoryId: chosen === NONE ? null : chosen, finalKind: kind })
                      }
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
                </div>

                <div className="mt-2">
                  <EvidenceEditor
                    kind={kind}
                    categoryId={chosen === NONE ? null : chosen}
                    tagIds={tagIds}
                    categories={categories}
                    label={r.cleanedDescription}
                    onChange={(p) => patch(r.id, p)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Pager page={shown} onPage={setPage} noun="names" />
    </Card>
  );
}
