"use client";

import { useState } from "react";
import { Undo2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import type { CurationRow } from "@/lib/corpus/types";
import { paginate } from "@/lib/paginate";
import { Pager } from "@/components/ui/pager";

const PAGE_SIZE = 10;

/**
 * Merchants dismissed from the review queue.
 *
 * Dismissing is sticky by design — no passive import can resurrect one — which also means a
 * mistaken dismissal was unreachable until this list existed. Collapsed by default because the
 * healthy case is not looking at it.
 */
export function DismissedList({
  rows,
  onRestore,
}: {
  rows: CurationRow[];
  onRestore: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const shown = paginate(rows, page, PAGE_SIZE);

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader
        label="Dismissed"
        action={
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="pressable text-xs text-muted-foreground hover:text-foreground"
          >
            {rows.length} merchant{rows.length === 1 ? "" : "s"} · {open ? "hide" : "show"}
          </button>
        }
      />
      {open && (
        <>
          <ul className="divide-y divide-[hsl(var(--glass-border))]">
            {shown.rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.cleanedDescription}</p>
                  <p className="tnum text-xs text-muted-foreground">seen {r.hitCount}×</p>
                </div>
                <button
                  type="button"
                  aria-label={`Restore ${r.cleanedDescription} to the review queue`}
                  onClick={() => onRestore(r.id)}
                  className="pressable grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground"
                >
                  <Undo2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <Pager page={shown} onPage={setPage} noun="merchants" />
        </>
      )}
    </Card>
  );
}
