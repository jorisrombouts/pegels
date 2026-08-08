"use client";

import { useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EvidenceEditor } from "./evidence-editor";
import { merchantTokens } from "@/lib/text/merchant-tokens";
import { cn } from "@/lib/utils";
import type { CurationRow } from "@/lib/corpus/types";
import type { Category, Tag } from "@/lib/domain/types";
import type { CorpusEdit } from "@/store/corpus";
import { paginate } from "@/lib/paginate";
import { Pager } from "@/components/ui/pager";

/**
 * The approved corpus — what the model actually retrieves from.
 *
 * Search matches on `merchantTokens`, the same tokeniser the lexical arm uses, so finding a row
 * here behaves like retrieval finding it rather than like a substring match.
 */
const PAGE_SIZE = 25;

export function CorpusTable({
  rows,
  categories,
  tags,
  onToggleGold,
  onRemove,
  onEdit,
}: {
  rows: CurationRow[];
  categories: Category[];
  tags: Tag[];
  onToggleGold: (id: string, gold: boolean) => void;
  onRemove: (id: string) => void;
  onEdit: (id: string, patch: CorpusEdit) => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  // Editing is opt-in per row: this list is mostly for browsing what has been learned, and 25 rows
  // of always-on controls would bury the merchant names the search exists to find.
  const [editing, setEditing] = useState<string | null>(null);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  const matches = useMemo(() => {
    const q = merchantTokens(query);
    if (!q.length) return rows;
    return rows.filter((r) => {
      const tokens = merchantTokens(r.cleanedDescription);
      return q.every((t) => tokens.some((x) => x.startsWith(t)));
    });
  }, [rows, query]);

  const goldCount = rows.filter((r) => r.gold).length;
  const shown = paginate(matches, page, PAGE_SIZE);

  return (
    <Card>
      <CardHeader
        label="Approved corpus"
        action={
          <span className="tnum text-xs text-muted-foreground">
            {rows.length} merchants · {goldCount} held out
          </span>
        }
      />
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(0); // a new search should land on its first page, not page 3 of it
        }}
        placeholder="Search merchants…"
        className="mb-3"
      />
      {matches.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {rows.length === 0 ? "No approved examples yet." : "No merchant matches that search."}
        </p>
      ) : (
        <ul className="divide-y divide-[hsl(var(--glass-border))]">
          {shown.rows.map((r) => {
            const cat = r.finalCategoryId ? categoryById.get(r.finalCategoryId) : null;
            const open = editing === r.id;
            return (
              <li key={r.id} className="py-2.5 first:pt-0">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.cleanedDescription}</p>
                    <p className="tnum truncate text-xs text-muted-foreground">
                      {r.finalKind !== "expense"
                        ? r.finalKind
                        : cat
                          ? `${cat.icon} ${cat.name}`
                          : "Uncategorized"}{" "}
                      · seen {r.hitCount}×
                      {r.finalTagIds.length > 0 &&
                        ` · ${r.finalTagIds.map((id) => tagById.get(id)?.name ?? id).join(", ")}`}
                      {!r.embedded && " · not yet embedded"}
                    </p>
                  </div>

                  <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    Hold out
                    <Switch
                      checked={r.gold}
                      onCheckedChange={(v) => onToggleGold(r.id, v)}
                      aria-label={`Hold ${r.cleanedDescription} out of retrieval`}
                    />
                  </label>

                  <button
                    type="button"
                    aria-label={`Edit ${r.cleanedDescription}`}
                    aria-expanded={open}
                    onClick={() => setEditing(open ? null : r.id)}
                    className={cn(
                      "pressable grid size-8 shrink-0 place-items-center rounded-full",
                      open ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Pencil className="size-4" />
                  </button>

                  <button
                    type="button"
                    aria-label={`Remove ${r.cleanedDescription}`}
                    onClick={() => onRemove(r.id)}
                    className="pressable grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-[hsl(var(--negative))]"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                {open && (
                  <div className="mt-2">
                    {/* Persists on each change — an approved row is already evidence, so there is
                        nothing to confirm the way approving a candidate confirms it. */}
                    <EvidenceEditor
                      kind={r.finalKind}
                      categoryId={r.finalCategoryId}
                      tagIds={r.finalTagIds}
                      categories={categories}
                      label={r.cleanedDescription}
                      onChange={(p) => onEdit(r.id, p)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Pager page={shown} onPage={setPage} noun="merchants" />
    </Card>
  );
}
