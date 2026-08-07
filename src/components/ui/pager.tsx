"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Page } from "@/lib/paginate";

/** Prev/next control with the range in words. Renders nothing when everything fits on one page. */
export function Pager<T>({
  page,
  onPage,
  noun,
}: {
  page: Page<T>;
  onPage: (next: number) => void;
  /** Plural noun for the count, e.g. "merchants". */
  noun: string;
}) {
  if (page.pageCount <= 1) return null;

  return (
    <div className="mt-3 flex items-center justify-between gap-3 border-t border-[hsl(var(--glass-border))] pt-3">
      <p className="tnum text-xs text-muted-foreground">
        {page.from}–{page.to} of {page.total} {noun}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous page"
          disabled={page.page === 0}
          onClick={() => onPage(page.page - 1)}
          className="pressable grid size-8 place-items-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="tnum px-1 text-xs text-muted-foreground">
          {page.page + 1} / {page.pageCount}
        </span>
        <button
          type="button"
          aria-label="Next page"
          disabled={page.page >= page.pageCount - 1}
          onClick={() => onPage(page.page + 1)}
          className="pressable grid size-8 place-items-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
