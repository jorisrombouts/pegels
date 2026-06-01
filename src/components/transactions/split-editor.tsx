"use client";

import { useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatSEKAbs, parseKronor } from "@/lib/format";
import type { Split } from "@/lib/domain/types";

let splitSeq = 0;
const newId = () => `sp-${Date.now()}-${splitSeq++}`;

/** Round to 2-decimal kronor. */
const round2 = (n: number) => Math.round(n * 100) / 100;

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
  const [people, setPeople] = useState(2);

  // Even split: your share is total ÷ people; the rest is one "Shared" row for everyone else.
  function splitEvenly(n: number) {
    const mine = round2(abs / n);
    onChange([
      { id: newId(), label: "Mine", amount: mine, mine: true },
      { id: newId(), label: "Shared", amount: round2(abs - mine), mine: false },
    ]);
  }

  const evenControls = (
    <>
      <PeopleStepper people={people} setPeople={setPeople} />
      <Button variant="glass" size="sm" onClick={() => splitEvenly(people)}>
        Split evenly
      </Button>
    </>
  );

  if (!splits || splits.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Splitting only counts the share you mark as <span className="font-semibold text-foreground">mine</span> toward your expenses.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="glass" size="sm" onClick={() => onChange([{ id: newId(), label: "Mine", amount: abs, mine: true }])}>
            + Add split
          </Button>
          {evenControls}
        </div>
        <p className="tnum text-xs text-muted-foreground">
          You’d pay {formatSEKAbs(round2(abs / people))} · split {people} ways
        </p>
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
            onChange={(e) => update(s.id, { amount: Math.abs(parseKronor(e.target.value)) })}
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="glass" size="sm" onClick={() => onChange([...splits, { id: newId(), amount: 0, mine: false }])}>
            + Add
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onChange(undefined)}>
            Clear
          </Button>
          {evenControls}
        </div>
        <p className="tnum text-xs text-muted-foreground">You pay: {formatSEKAbs(mineTotal)}</p>
      </div>
    </div>
  );
}

/** Stepper for the number of people to split among (minimum 2). */
function PeopleStepper({ people, setPeople }: { people: number; setPeople: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-full glass-inset px-1 py-0.5">
      <button
        type="button"
        aria-label="Fewer people"
        disabled={people <= 2}
        onClick={() => setPeople(people - 1)}
        className="pressable grid size-6 place-items-center rounded-full text-muted-foreground disabled:opacity-30"
      >
        <Minus className="size-3.5" />
      </button>
      <span className="tnum w-12 text-center text-xs">
        <span className="font-semibold text-foreground">{people}</span> ppl
      </span>
      <button
        type="button"
        aria-label="More people"
        onClick={() => setPeople(people + 1)}
        className="pressable grid size-6 place-items-center rounded-full text-muted-foreground"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
