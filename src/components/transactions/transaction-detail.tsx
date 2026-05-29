"use client";

import { Check, EyeOff, MousePointerClick } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Field, Textarea } from "@/components/ui/input";
import { TagEditor } from "./tag-editor";
import { SplitEditor } from "./split-editor";
import { useData } from "@/store/data";
import { useUI } from "@/store/ui";
import { formatSEK, dayLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium text-muted-foreground">{children}</span>;
}

/** Empty state shown when no transaction is selected. */
export function DetailEmpty() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center">
      <MousePointerClick className="size-6 text-muted-foreground" />
      <p className="font-medium">Select an item</p>
      <p className="max-w-56 text-sm text-muted-foreground">Pick a transaction on the left to view or edit its category, splits, and tags.</p>
    </div>
  );
}

export function TransactionDetail({ txId }: { txId: string }) {
  const { transactions, categories, accounts, updateTransaction } = useData();
  const masked = useUI((s) => s.masked);
  const tx = transactions.find((t) => t.id === txId);
  if (!tx) return <DetailEmpty />;

  const account = accounts.find((a) => a.id === tx.accountId);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const predicted = tx.predictedCategoryId ? categoryById.get(tx.predictedCategoryId) : undefined;
  const showPredictedHint = tx.categorySource === "user" && predicted && tx.predictedCategoryId !== tx.categoryId;
  const isIncome = tx.amount > 0 && !tx.ignored;

  return (
    <div className="space-y-6">
      {/* Headline */}
      <div className={cn(tx.ignored && "opacity-60")}>
        <p className={cn("text-lg font-semibold", tx.ignored && "line-through")}>{tx.description}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {dayLabel(tx.date)} · {account?.name}
        </p>
        <div className="mt-2 flex items-center gap-3">
          <span
            className={cn("font-display tnum text-4xl font-bold", tx.ignored && "line-through")}
            style={{ color: isIncome ? "hsl(var(--positive))" : undefined }}
          >
            {formatSEK(tx.amount, masked)}
          </span>
          {tx.ignored && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--muted)/0.6)] px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              <EyeOff className="size-3" /> Excluded
            </span>
          )}
        </div>
      </div>

      {/* Category */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>Category</Label>
          {tx.categorySource === "model" && tx.categoryConfidence != null ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: tx.categoryConfidence >= 0.85 ? "hsl(var(--positive))" : tx.categoryConfidence >= 0.6 ? "hsl(var(--warning))" : "hsl(var(--negative))" }}
              />
              {Math.round(tx.categoryConfidence * 100)}%
            </span>
          ) : tx.categorySource === "user" ? (
            <span className="flex items-center gap-1 text-xs text-primary">
              <Check className="size-3.5" /> Corrected
            </span>
          ) : null}
        </div>
        <Select
          value={tx.categoryId ?? ""}
          onValueChange={(v) => updateTransaction(tx.id, { categoryId: v, categorySource: "user", needsReview: false })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Uncategorized" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.parentId ? "↳ " : ""}
                {c.icon} {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {showPredictedHint && (
          <p className="text-xs text-muted-foreground">
            AI predicted: {predicted!.icon} {predicted!.name}
          </p>
        )}
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <Label>Tags</Label>
        <TagEditor tagIds={tx.tagIds} onChange={(tagIds) => updateTransaction(tx.id, { tagIds })} />
      </div>

      {/* Split */}
      <div className="space-y-2">
        <Label>Split this payment</Label>
        <SplitEditor amount={tx.amount} splits={tx.splits} onChange={(splits) => updateTransaction(tx.id, { splits })} />
      </div>

      {/* Exclude */}
      <div className="flex items-start justify-between gap-4 rounded-2xl glass-inset p-4">
        <div>
          <p className="text-sm font-medium">Exclude from totals</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Excluded transactions don&apos;t count toward your dashboard or month totals.</p>
        </div>
        <Switch
          checked={tx.ignored}
          onCheckedChange={(v) => updateTransaction(tx.id, { ignored: v })}
          aria-label="Exclude from totals"
        />
      </div>

      {/* Notes */}
      <Field label="Notes">
        <Textarea value={tx.notes ?? ""} onChange={(e) => updateTransaction(tx.id, { notes: e.target.value })} placeholder="Add a note…" />
      </Field>
    </div>
  );
}
