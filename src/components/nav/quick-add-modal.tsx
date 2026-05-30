"use client";

import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useData } from "@/store/data";
import { useUI } from "@/store/ui";
import { cn } from "@/lib/utils";
import { parseKronor } from "@/lib/format";
import type { Transaction } from "@/lib/domain/types";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Add-a-transaction modal, opened from the nav's detached "+" circle (store-controlled). */
export function QuickAddModal() {
  const { accounts, categories, addTransaction } = useData();
  const open = useUI((s) => s.quickAddOpen);
  const setOpen = useUI((s) => s.setQuickAddOpen);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState<string>("");
  const [date, setDate] = useState(todayISO());

  function reset() {
    setDescription("");
    setAmount("");
    setKind("expense");
    setCategoryId("");
    setDate(todayISO());
  }

  function submit() {
    const value = Math.abs(parseKronor(amount));
    if (!description || value === 0 || !accountId) return;
    const tx: Transaction = {
      id: `tx-${Date.now()}`,
      date,
      description,
      amount: kind === "expense" ? -value : value,
      accountId,
      categoryId: categoryId || null,
      predictedCategoryId: null,
      categoryConfidence: null,
      categorySource: "user",
      needsReview: false,
      tagIds: [],
      kind,
      goalId: null,
    };
    addTransaction(tx);
    reset();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogContent title="Add transaction">
        <div className="space-y-4">
          <Field label="Description">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. ICA Maxi Haninge" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (kr)">
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" />
            </Field>
            <div className="flex items-end gap-1">
              {(["expense", "income"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    "pressable h-[42px] flex-1 rounded-xl text-sm font-medium capitalize",
                    kind === k ? "bg-primary text-primary-foreground" : "glass-inset text-muted-foreground",
                  )}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          <Field label="Account">
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.icon} {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Category">
            <Select value={categoryId} onValueChange={setCategoryId}>
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
          </Field>

          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>

          <Button className="w-full" onClick={submit}>
            Add transaction
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
