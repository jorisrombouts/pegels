"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TagEditor } from "@/components/transactions/tag-editor";
import { orderCategories } from "@/lib/domain/selectors";
import { formatSEKAbs } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CurationRow } from "@/lib/corpus/types";
import type { Category } from "@/lib/domain/types";
import type { CorpusEdit } from "@/store/corpus";
import { paginate } from "@/lib/paginate";
import { Pager } from "@/components/ui/pager";

const NONE = "__none__";
/** Small enough that the top of the queue stays the point, rather than a wall of rows. */
const PAGE_SIZE = 20;

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
  // Pending edits per row, applied on approve. Category, kind and tags are all part of the evidence
  // a merchant contributes, so all three are editable before it becomes retrievable.
  const [edits, setEdits] = useState<Record<string, CorpusEdit>>({});
  const [page, setPage] = useState(0);
  const patch = (id: string, p: CorpusEdit) => setEdits((e) => ({ ...e, [id]: { ...e[id], ...p } }));
  const ordered = orderCategories(categories);
  const nameOf = new Map(categories.map((c) => [c.id, c]));
  // Rows leave this list as they're approved, so the page can shrink out from under the user;
  // paginate clamps rather than showing an empty page.
  const shown = paginate(rows, page, PAGE_SIZE);

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
          {shown.rows.map((r) => {
            const edit = edits[r.id] ?? {};
            const chosen = edit.finalCategoryId === undefined ? r.finalCategoryId ?? NONE : edit.finalCategoryId ?? NONE;
            const kind = edit.finalKind ?? r.finalKind;
            const tagIds = edit.finalTagIds ?? r.finalTagIds;
            const current = chosen === NONE ? null : nameOf.get(chosen);
            return (
              <li key={r.id} className="py-2.5 first:pt-0">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.cleanedDescription}</p>
                    <p className="tnum text-xs text-muted-foreground">
                      seen {r.hitCount}×{` · ~${formatSEKAbs(Math.abs(r.amount), false)}`}
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

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {/* Only expenses carry a category — income and transfers have none to pick. */}
                  <div className="flex overflow-hidden rounded-xl glass-inset p-0.5" role="group" aria-label={`Type for ${r.cleanedDescription}`}>
                    {(["expense", "income", "transfer"] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => patch(r.id, { finalKind: k, ...(k !== "expense" && { finalCategoryId: null }) })}
                        aria-pressed={kind === k}
                        className={cn(
                          "pressable rounded-lg px-2 py-1 text-xs font-medium capitalize",
                          kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {k}
                      </button>
                    ))}
                  </div>

                  {kind === "expense" && (
                    <Select value={chosen} onValueChange={(v) => patch(r.id, { finalCategoryId: v === NONE ? null : v })}>
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
                  )}

                  <TagEditor tagIds={tagIds} onChange={(ids) => patch(r.id, { finalTagIds: ids })} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Pager page={shown} onPage={setPage} noun="merchants" />
    </Card>
  );
}
