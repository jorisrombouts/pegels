"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TagEditor } from "@/components/transactions/tag-editor";
import { orderCategories } from "@/lib/domain/selectors";
import { cn } from "@/lib/utils";
import type { Category, TransactionKind } from "@/lib/domain/types";
import type { CorpusEdit } from "@/store/corpus";

const NONE = "__none__";

/**
 * The three things a corpus row teaches the model: what kind of money event it is, which category
 * it belongs to, and which tags apply. Shared by the review queue (where edits are pending until
 * approval) and the approved table (where they persist immediately), so the two cannot drift.
 */
export function EvidenceEditor({
  kind,
  categoryId,
  tagIds,
  categories,
  label,
  onChange,
}: {
  kind: TransactionKind;
  categoryId: string | null;
  tagIds: string[];
  categories: Category[];
  /** Merchant name, for accessible labels — several of these render in one list. */
  label: string;
  onChange: (patch: CorpusEdit) => void;
}) {
  const ordered = orderCategories(categories);
  const current = categoryId ? categories.find((c) => c.id === categoryId) : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex overflow-hidden rounded-xl glass-inset p-0.5" role="group" aria-label={`Type for ${label}`}>
        {(["expense", "income", "transfer"] as const).map((k) => (
          <button
            key={k}
            type="button"
            // Only expenses carry a category, so switching away from one clears it rather than
            // leaving a category stranded on a row that cannot show it.
            onClick={() => onChange({ finalKind: k, ...(k !== "expense" && { finalCategoryId: null }) })}
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
        <Select
          value={categoryId ?? NONE}
          onValueChange={(v) => onChange({ finalCategoryId: v === NONE ? null : v })}
        >
          <SelectTrigger className="w-44 shrink-0" aria-label={`Category for ${label}`}>
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

      <TagEditor tagIds={tagIds} onChange={(ids) => onChange({ finalTagIds: ids })} />
    </div>
  );
}
