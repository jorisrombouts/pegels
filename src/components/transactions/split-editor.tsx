"use client";

import { X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatSEKAbs } from "@/lib/format";
import type { Split } from "@/lib/domain/types";

let splitSeq = 0;
const newId = () => `sp-${Date.now()}-${splitSeq++}`;

/** Edit how a payment is split; only `mine` portions count toward expenses. */
export function SplitEditor({
  amount,
  splits,
  onChange,
}: {
  amount: number; // tx amount (negative for expense)
  splits: Split[] | undefined;
  onChange: (splits: Split[] | undefined) => void;
}) {
  const abs = Math.abs(amount);

  if (!splits || splits.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Splitting only counts the share you mark as <span className="font-semibold text-foreground">mine</span> toward your expenses.
        </p>
        <div className="flex gap-2">
          <Button variant="glass" size="sm" onClick={() => onChange([{ id: newId(), label: "Mine", amount: abs, mine: true }])}>
            + Add split
          </Button>
          <Button
            variant="glass"
            size="sm"
            onClick={() =>
              onChange([
                { id: newId(), label: "Mine", amount: Math.round(abs / 2), mine: true },
                { id: newId(), label: "Shared", amount: abs - Math.round(abs / 2), mine: false },
              ])
            }
          >
            Equal split
          </Button>
        </div>
      </div>
    );
  }

  const mineTotal = splits.reduce((s, x) => (x.mine ? s + Math.abs(x.amount) : s), 0);

  function update(id: string, patch: Partial<Split>) {
    onChange(splits!.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  return (
    <div className="space-y-3">
      {splits.map((s) => (
        <div key={s.id} className="flex items-center gap-2">
          <Input
            value={s.label ?? ""}
            onChange={(e) => update(s.id, { label: e.target.value })}
            placeholder="Label"
            className="flex-1"
          />
          <Input
            value={String(s.amount)}
            onChange={(e) => update(s.id, { amount: Math.abs(parseFloat(e.target.value) || 0) })}
            inputMode="decimal"
            className="w-24"
          />
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            mine
            <Switch checked={s.mine} onCheckedChange={(v) => update(s.id, { mine: v })} />
          </label>
          <button type="button" aria-label="Remove split" onClick={() => onChange(splits.filter((x) => x.id !== s.id))}>
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>
      ))}

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button variant="glass" size="sm" onClick={() => onChange([...splits, { id: newId(), amount: 0, mine: false }])}>
            + Add
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onChange(undefined)}>
            Clear
          </Button>
        </div>
        <p className="tnum text-xs text-muted-foreground">You pay: {formatSEKAbs(mineTotal)}</p>
      </div>
    </div>
  );
}
