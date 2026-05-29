"use client";

import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { CategoryChip } from "@/components/category-chip";
import { formatSEK, dayLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Category, Transaction } from "@/lib/domain/types";

/** Last few transactions; income is green, excluded rows are struck through. */
export function RecentActivity({
  transactions,
  categoryById,
  masked = false,
  onSelect,
}: {
  transactions: Transaction[];
  categoryById: Map<string, Category>;
  masked?: boolean;
  onSelect?: (txId: string) => void;
}) {
  return (
    <Card className="flex h-full flex-col" data-testid="recent">
      <CardHeader
        label="Recent activity"
        action={
          <Link href="/transactions" className="text-xs font-semibold text-primary hover:underline">
            All →
          </Link>
        }
      />
      <ul className="divide-y divide-[hsl(var(--glass-border))]">
        {transactions.map((tx) => {
          const isTransfer = tx.kind === "transfer";
          const isIncome = tx.amount > 0 && !isTransfer;
          return (
            <li key={tx.id}>
              <button
                type="button"
                onClick={() => onSelect?.(tx.id)}
                className={cn(
                  "pressable -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-[hsl(var(--muted)/0.45)]",
                  isTransfer && "opacity-60",
                )}
              >
                <span className="tnum w-12 shrink-0 text-[11px] text-muted-foreground">{dayLabel(tx.date)}</span>
                <span className={cn("min-w-0 flex-1 truncate text-sm", isTransfer && "line-through")}>{tx.description}</span>
                {tx.categoryId && <CategoryChip category={categoryById.get(tx.categoryId)} className="hidden sm:inline-flex" />}
                <span
                  className={cn("tnum shrink-0 text-sm font-semibold", isTransfer && "line-through")}
                  style={{ color: isIncome ? "hsl(var(--positive))" : undefined }}
                >
                  {formatSEK(tx.amount, masked)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
