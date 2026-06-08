"use client";

import { memo } from "react";
import { EyeOff, Split } from "lucide-react";
import { CategoryChip } from "@/components/category-chip";
import { effectiveExpense } from "@/lib/domain/effectiveExpense";
import { formatSEK, dayLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Category, Transaction } from "@/lib/domain/types";

// memo + an id-taking onSelect lets the parent pass one stable callback, so editing the selection
// (or typing in search) only re-renders the rows whose props actually changed, not the whole list.
export const TransactionRow = memo(function TransactionRow({
  tx,
  category,
  selected,
  onSelect,
  masked = false,
  categories,
  onCorrect,
}: {
  tx: Transaction;
  category: Category | undefined;
  selected: boolean;
  onSelect: (id: string) => void;
  masked?: boolean;
  // Provided only by the list that supports inline review. When the row needs review, the category
  // slot becomes a quick category picker that corrects the row in place (clears the flag + logs it).
  categories?: Category[];
  onCorrect?: (tx: Transaction, categoryId: string) => void;
}) {
  const isTransfer = tx.kind === "transfer";
  const isIncome = tx.kind === "income";
  const isExcluded = !!tx.excluded;
  const showMasked = masked || isIncome;
  const dimmed = isTransfer || isExcluded;
  // For a split expense, show your effective share (routes through effectiveExpense), not the gross.
  const hasSplits = tx.kind === "expense" && !isExcluded && !!tx.splits && tx.splits.length > 0;
  const displayAmount = hasSplits ? -effectiveExpense(tx) : tx.amount;
  const canCorrect = !!onCorrect && !!categories && tx.needsReview && !isExcluded && tx.kind === "expense";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(tx.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(tx.id);
        }
      }}
      aria-current={selected}
      className={cn(
        "pressable flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left",
        selected ? "bg-[hsl(var(--muted)/0.7)] ring-1 ring-primary/40" : "hover:bg-[hsl(var(--muted)/0.45)]",
        dimmed && "opacity-60",
      )}
    >
      <span className="tnum w-14 shrink-0 text-xs text-muted-foreground">{dayLabel(tx.date)}</span>

      {tx.needsReview && !isExcluded && (
        <span className="size-2 shrink-0 rounded-full bg-warning" title="Needs review" aria-label="Needs review" />
      )}

      <span className={cn("min-w-0 flex-1 truncate text-sm", dimmed && "line-through")}>{tx.description}</span>

      {isExcluded && (
        <span className="hidden shrink-0 items-center gap-1 rounded-full bg-[hsl(var(--muted)/0.6)] px-2 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
          <EyeOff className="size-3" /> Ignored
        </span>
      )}

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

      {canCorrect ? (
        // Native select: a real mobile picker, fully keyboard/screen-reader accessible, and it stops
        // its own clicks from bubbling so choosing a category corrects in place (not opens the detail).
        <select
          aria-label="Set category"
          value={tx.categoryId ?? ""}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onChange={(e) => onCorrect!(tx, e.target.value)}
          className="shrink-0 rounded-full glass-inset px-2 py-1 text-xs text-foreground ring-1 ring-[hsl(var(--warning)/0.45)] max-w-[8.5rem]"
        >
          <option value="" disabled>
            Pick category…
          </option>
          {categories!.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
      ) : (
        !isTransfer &&
        tx.categoryId && (
          <CategoryChip
            category={category}
            confidence={tx.categorySource === "model" ? tx.categoryConfidence : null}
            className="hidden shrink-0 sm:inline-flex"
          />
        )
      )}

      {hasSplits && (
        <span className="hidden shrink-0 items-center gap-1 rounded-full bg-[hsl(var(--muted)/0.6)] px-2 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
          <Split className="size-3" /> Split
        </span>
      )}

      <span className={cn("tnum shrink-0 text-sm font-semibold", dimmed && "line-through")}>
        {formatSEK(displayAmount, showMasked)}
      </span>
    </div>
  );
});
