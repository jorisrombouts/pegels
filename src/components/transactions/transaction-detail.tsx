"use client";

import { useState } from "react";
import { Check, EyeOff, MousePointerClick, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { TagEditor } from "./tag-editor";
import { SplitEditor } from "./split-editor";
import { logDetailCorrection, logDetailApproval } from "@/app/actions/ai";
import { useData } from "@/store/data";
import { useUI } from "@/store/ui";
import { formatSEK, dayLabel } from "@/lib/format";
import { orderCategories } from "@/lib/domain/selectors";
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

export function TransactionDetail({ txId, onDeleted }: { txId: string; onDeleted?: () => void }) {
  const { transactions, categories, accounts, updateTransaction, removeTransaction } = useData();
  const masked = useUI((s) => s.masked);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const tx = transactions.find((t) => t.id === txId);
  if (!tx) return <DetailEmpty />;

  const account = accounts.find((a) => a.id === tx.accountId);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const predicted = tx.predictedCategoryId ? categoryById.get(tx.predictedCategoryId) : undefined;
  const showPredictedHint = tx.categorySource === "user" && predicted && tx.predictedCategoryId !== tx.categoryId;
  const isIncome = tx.kind === "income";

  return (
    <div className="space-y-6">
      {/* Headline */}
      <div className={cn(tx.kind === "transfer" && "opacity-60")}>
        <p className={cn("text-lg font-semibold", tx.kind === "transfer" && "line-through")}>{tx.description}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {dayLabel(tx.date)} · {account?.name}
        </p>
        <div className="mt-2 flex items-center gap-3">
          <span
            className={cn("font-display tnum text-4xl font-bold", tx.kind === "transfer" && "line-through")}
            style={{ color: isIncome ? "hsl(var(--positive))" : undefined }}
          >
            {formatSEK(tx.amount, masked)}
          </span>
          {tx.kind === "transfer" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--muted)/0.6)] px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              <EyeOff className="size-3" /> Transfer
            </span>
          )}
        </div>
      </div>

      {/* Category */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>Category</Label>
          {tx.categorySource === "user" ? (
            // A hand-pick is certain → 100%. We don't touch the stored categoryConfidence so the
            // model's original score stays available for the training-set log.
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: "hsl(var(--positive))" }} />
              100%
            </span>
          ) : tx.categorySource === "model" && tx.categoryConfidence != null ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: tx.categoryConfidence >= 0.85 ? "hsl(var(--positive))" : tx.categoryConfidence >= 0.6 ? "hsl(var(--warning))" : "hsl(var(--negative))" }}
              />
              {Math.round(tx.categoryConfidence * 100)}%
            </span>
          ) : null}
        </div>
        <Select
          value={tx.categoryId ?? ""}
          onValueChange={(v) => {
            void logDetailCorrection({
              rawDescription: tx.description,
              cleanedDescription: tx.description,
              amount: tx.amount,
              predictedKind: tx.kind,
              predictedCategoryId: tx.predictedCategoryId,
              predictedConfidence: tx.categoryConfidence,
              finalKind: tx.kind,
              finalCategoryId: v,
            });
            updateTransaction(tx.id, { categoryId: v, categorySource: "user", needsReview: false });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Uncategorized" />
          </SelectTrigger>
          <SelectContent>
            {orderCategories(categories).map((c) => (
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
        {tx.needsReview && (
          // Confirm a low-confidence guess that's actually right (changing the category already clears
          // the flag, but re-picking the same one does nothing). Marks it user-affirmed → 100%.
          <button
            type="button"
            onClick={() => {
              updateTransaction(tx.id, { needsReview: false, categorySource: "user" });
              // Feed the confirmed guess back as a positive few-shot example (final == predicted).
              void logDetailApproval({
                rawDescription: tx.description,
                cleanedDescription: tx.description,
                amount: tx.amount,
                predictedKind: tx.kind,
                predictedCategoryId: tx.predictedCategoryId ?? null,
                predictedConfidence: tx.categoryConfidence ?? null,
                finalKind: tx.kind,
                finalCategoryId: tx.categoryId,
              });
            }}
            className="pressable mt-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{ backgroundColor: "hsl(var(--positive) / 0.15)", color: "hsl(var(--positive))" }}
          >
            <Check className="size-4" /> Approve this category
          </button>
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

      {/* Type */}
      <div className="space-y-2">
        <Label>Type</Label>
        <div className="flex overflow-hidden rounded-xl glass-inset p-1">
          {(["expense", "income", "transfer"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                void logDetailCorrection({
                  rawDescription: tx.description,
                  cleanedDescription: tx.description,
                  amount: tx.amount,
                  predictedKind: tx.kind,
                  predictedCategoryId: tx.predictedCategoryId,
                  predictedConfidence: tx.categoryConfidence,
                  finalKind: k,
                  finalCategoryId: tx.categoryId,
                });
                updateTransaction(tx.id, { kind: k });
              }}
              className={cn(
                "pressable flex-1 rounded-lg px-3 py-1.5 text-sm font-medium capitalize",
                tx.kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {k}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Transfers move money between your own accounts — they don&apos;t count as spending or income.
        </p>
      </div>

      {/* Ignore */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label>Don&apos;t count this transaction</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">Stays in the list but is excluded from all spending totals.</p>
        </div>
        <Switch
          aria-label="Don't count this transaction"
          checked={!!tx.excluded}
          onCheckedChange={(v) => updateTransaction(tx.id, { excluded: v })}
        />
      </div>

      {/* Notes */}
      <Field label="Notes">
        <Textarea value={tx.notes ?? ""} onChange={(e) => updateTransaction(tx.id, { notes: e.target.value })} placeholder="Add a note…" />
      </Field>

      {/* Delete — permanent, so it's gated behind a confirm dialog. */}
      <div className="border-t border-[hsl(var(--glass-border))] pt-4">
        <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)} className="gap-1.5">
          <Trash2 className="size-4" /> Delete transaction
        </Button>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent
          title="Delete transaction?"
          description="This permanently removes it from your account and can't be undone."
        >
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button
              variant="danger"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                removeTransaction(tx.id);
                setConfirmDelete(false);
                onDeleted?.();
              }}
            >
              <Trash2 className="size-4" /> Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
