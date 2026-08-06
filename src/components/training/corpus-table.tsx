"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { merchantTokens } from "@/lib/text/merchant-tokens";
import type { CurationRow } from "@/app/actions/corpus";
import type { Category, Tag } from "@/lib/domain/types";

/**
 * The approved corpus — what the model actually retrieves from.
 *
 * Search matches on `merchantTokens`, the same tokeniser the lexical arm uses, so finding a row
 * here behaves like retrieval finding it rather than like a substring match.
 */
export function CorpusTable({
  rows,
  categories,
  tags,
  onToggleGold,
  onRemove,
}: {
  rows: CurationRow[];
  categories: Category[];
  tags: Tag[];
  onToggleGold: (id: string, gold: boolean) => void;
  onRemove: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  const shown = useMemo(() => {
    const q = merchantTokens(query);
    if (!q.length) return rows;
    return rows.filter((r) => {
      const tokens = merchantTokens(r.cleanedDescription);
      return q.every((t) => tokens.some((x) => x.startsWith(t)));
    });
  }, [rows, query]);

  const goldCount = rows.filter((r) => r.gold).length;

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
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search merchants…"
        className="mb-3"
      />
      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {rows.length === 0 ? "No approved examples yet." : "No merchant matches that search."}
        </p>
      ) : (
        <ul className="divide-y divide-[hsl(var(--glass-border))]">
          {shown.slice(0, 100).map((r) => {
            const cat = r.finalCategoryId ? categoryById.get(r.finalCategoryId) : null;
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.cleanedDescription}</p>
                  <p className="tnum truncate text-xs text-muted-foreground">
                    {cat ? `${cat.icon} ${cat.name}` : "Uncategorized"} · seen {r.hitCount}×
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
                  aria-label={`Remove ${r.cleanedDescription}`}
                  onClick={() => onRemove(r.id)}
                  className="pressable grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-[hsl(var(--negative))]"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {shown.length > 100 && (
        <p className="pt-3 text-center text-xs text-muted-foreground">
          Showing the 100 most-seen of {shown.length} — search to narrow.
        </p>
      )}
    </Card>
  );
}
