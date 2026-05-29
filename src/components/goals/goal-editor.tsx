"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useData } from "@/store/data";
import { formatSEKAbs, dayLabel } from "@/lib/format";
import type { Goal, GoalContribution } from "@/lib/domain/types";

const NONE = "none";

export function GoalEditor({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const { accounts, upsertGoal, removeGoal } = useData();
  const savings = accounts.filter((a) => a.kind === "savings");

  const [name, setName] = useState(goal?.name ?? "");
  const [icon, setIcon] = useState(goal?.icon ?? "🎯");
  const [target, setTarget] = useState(goal ? String(goal.target) : "");
  const [baseline, setBaseline] = useState(goal ? String(goal.baseline) : "");
  const [deadline, setDeadline] = useState(goal?.deadline ?? "");
  const [accountId, setAccountId] = useState(goal?.accountId ?? NONE);
  const [contributions, setContributions] = useState<GoalContribution[]>(goal?.contributions ?? []);
  const [draft, setDraft] = useState("");

  const saved = (parseFloat(baseline.replace(",", ".")) || 0) + contributions.reduce((s, c) => s + c.amount, 0);

  function addContribution() {
    const amount = Math.abs(parseFloat(draft.replace(",", ".")) || 0);
    if (amount <= 0) return;
    setContributions((cs) => [...cs, { id: `gc-${Date.now()}`, date: new Date().toISOString().slice(0, 10), amount }]);
    setDraft("");
  }

  function save() {
    const tgt = Math.abs(parseFloat(target.replace(",", ".")) || 0);
    if (!name.trim() || tgt <= 0) return;
    upsertGoal({
      id: goal?.id ?? `goal-${Date.now()}`,
      name: name.trim(),
      icon: icon || "🎯",
      target: tgt,
      baseline: Math.abs(parseFloat(baseline.replace(",", ".")) || 0),
      deadline: deadline || null,
      accountId: accountId === NONE ? null : accountId,
      contributions,
    });
    onClose();
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-lg font-semibold">{goal ? "Edit goal" : "New goal"}</p>
        <p className="text-xs text-muted-foreground">Track progress toward a savings target.</p>
      </div>

      <Field label="Name">
        <div className="flex gap-2">
          <Input value={icon} onChange={(e) => setIcon(e.target.value)} className="w-14 text-center" aria-label="Emoji" maxLength={2} />
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Japan Trip" className="flex-1" />
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Target (kr)">
          <Input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" placeholder="0" />
        </Field>
        <Field label="Already saved (kr)">
          <Input value={baseline} onChange={(e) => setBaseline(e.target.value)} inputMode="decimal" placeholder="0" />
        </Field>
      </div>

      <Field label="Linked savings account">
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>None</SelectItem>
            {savings.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.icon} {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {/* Contributions */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Contributions</span>
          <span className="tnum text-xs text-muted-foreground">Saved {formatSEKAbs(saved)}</span>
        </div>
        {contributions.length > 0 && (
          <ul className="space-y-1">
            {contributions.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-lg glass-inset px-3 py-1.5 text-sm">
                <span className="tnum text-muted-foreground">{dayLabel(c.date)}</span>
                <span className="flex items-center gap-2">
                  <span className="tnum">{formatSEKAbs(c.amount)}</span>
                  <button type="button" aria-label="Remove contribution" onClick={() => setContributions((cs) => cs.filter((x) => x.id !== c.id))}>
                    <X className="size-3.5 text-muted-foreground" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} inputMode="decimal" placeholder="Add amount" onKeyDown={(e) => e.key === "Enter" && addContribution()} />
          <Button variant="glass" size="sm" onClick={addContribution}>Add</Button>
        </div>
      </div>

      <Field label="Deadline (optional)">
        <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      </Field>

      <div className="flex items-center justify-between pt-1">
        {goal ? (
          <Button variant="danger" size="sm" onClick={() => { removeGoal(goal.id); onClose(); }} className="gap-1.5">
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
