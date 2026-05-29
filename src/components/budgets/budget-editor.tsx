"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useData } from "@/store/data";
import { monthLabel } from "@/lib/format";
import type { Budget } from "@/lib/domain/types";

/**
 * Create/edit a budget. Seeded from props on mount; the parent remounts it via
 * a `key` when the selection changes, so no reset effect is needed.
 */
export function BudgetEditor({ budget, month, onClose }: { budget: Budget | null; month: string; onClose: () => void }) {
  const { categories, upsertBudget, removeBudget } = useData();
  const [categoryId, setCategoryId] = useState(budget?.categoryId ?? categories[0]?.id ?? "");
  const [limit, setLimit] = useState(budget ? String(budget.limit) : "");
  const [repeat, setRepeat] = useState(budget ? budget.month === null : true);

  function save() {
    const lim = Math.abs(parseFloat(limit.replace(",", ".")) || 0);
    if (!categoryId || lim <= 0) return;
    upsertBudget({ id: budget?.id ?? `bud-${Date.now()}`, categoryId, limit: lim, month: repeat ? null : month });
    onClose();
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-lg font-semibold">{budget ? "Edit budget" : "New budget"}</p>
        <p className="text-xs text-muted-foreground">{monthLabel(month)}</p>
      </div>

      <Field label="Category">
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger>
            <SelectValue placeholder="Select category" />
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

      <Field label="Monthly limit (kr)">
        <Input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="decimal" placeholder="0" />
      </Field>

      <div className="flex items-start justify-between gap-4 rounded-2xl glass-inset p-4">
        <div>
          <p className="text-sm font-medium">Repeat every month</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Applies to this month and future months.</p>
        </div>
        <Switch checked={repeat} onCheckedChange={setRepeat} aria-label="Repeat every month" />
      </div>

      <div className="flex items-center justify-between pt-1">
        {budget ? (
          <Button variant="danger" size="sm" onClick={() => { removeBudget(budget.id); onClose(); }} className="gap-1.5">
            <Trash2 className="size-4" /> Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save}>Save</Button>
        </div>
      </div>
    </div>
  );
}
