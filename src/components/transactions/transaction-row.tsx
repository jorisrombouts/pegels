"use client";

import { EyeOff } from "lucide-react";
import { CategoryChip } from "@/components/category-chip";
import { formatSEK, dayLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Category, Transaction } from "@/lib/domain/types";

export function TransactionRow({
  tx,
  category,
  selected,
  onSelect,
  masked = false,
}: {
  tx: Transaction;
  category: Category | undefined;
  selected: boolean;
  onSelect: () => void;
  masked?: boolean;
}) {
  const isTransfer = tx.kind === "transfer";
  const isIncome = tx.kind === "income";
  const showMasked = masked || isIncome;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected}
      className={cn(
        "pressable flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left",
        selected ? "bg-[hsl(var(--muted)/0.7)] ring-1 ring-primary/40" : "hover:bg-[hsl(var(--muted)/0.45)]",
        isTransfer && "opacity-60",
      )}
    >
      <span className="tnum w-14 shrink-0 text-xs text-muted-foreground">{dayLabel(tx.date)}</span>

      {tx.needsReview && (
        <span className="size-2 shrink-0 rounded-full bg-warning" title="Needs review" aria-label="Needs review" />
      )}

      <span className={cn("min-w-0 flex-1 truncate text-sm", isTransfer && "line-through")}>{tx.description}</span>

      {isTransfer && (
        <span className="hidden shrink-0 items-center gap-1 rounded-full bg-[hsl(var(--muted)/0.6)] px-2 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
          <EyeOff className="size-3" /> Transfer
        </span>
      )}

      {isIncome && (
        <span className="hidden shrink-0 items-center rounded-full bg-[hsl(var(--muted)/0.6)] px-2 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
          Income
        </span>
      )}

      {!isTransfer && tx.categoryId && (
        <CategoryChip
          category={category}
          confidence={tx.categorySource === "model" ? tx.categoryConfidence : null}
          className="hidden shrink-0 sm:inline-flex"
        />
      )}

      <span className={cn("tnum shrink-0 text-sm font-semibold", isTransfer && "line-through")}>
        {formatSEK(tx.amount, showMasked)}
      </span>
    </button>
  );
}
