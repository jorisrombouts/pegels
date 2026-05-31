"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useData } from "@/store/data";
import { orderCategories } from "@/lib/domain/selectors";
import type { CategorizationRule, MatchMode, TransactionKind } from "@/lib/domain/types";

const NONE = "__none__";

const MODES: { value: MatchMode; label: string }[] = [
  { value: "contains", label: "contains" },
  { value: "startsWith", label: "starts with" },
  { value: "exact", label: "is exactly" },
];

export function RuleEditor({ rule, onClose }: { rule: CategorizationRule | null; onClose: () => void }) {
  const { categories, tags, rules, upsertRule, removeRule } = useData();

  const [matchText, setMatchText] = useState(rule?.matchText ?? "");
  const [matchMode, setMatchMode] = useState<MatchMode>(rule?.matchMode ?? "contains");
  const [categoryId, setCategoryId] = useState<string>(rule?.setCategoryId ?? "");
  const [kind, setKind] = useState<string>(rule?.setKind ?? "");
  const [addTagIds, setAddTagIds] = useState<string[]>(rule?.addTagIds ?? []);

  const hasOutcome = !!categoryId || !!kind || addTagIds.length > 0;
  const canSave = matchText.trim().length > 0 && hasOutcome;

  function save() {
    if (!canSave) return;
    const maxPriority = rules.reduce((m, r) => Math.max(m, r.priority), 0);
    upsertRule({
      id: rule?.id ?? `rule-${Date.now()}`,
      priority: rule?.priority ?? maxPriority + 10,
      enabled: rule?.enabled ?? true,
      matchText: matchText.trim(),
      matchMode,
      setCategoryId: categoryId || null,
      setKind: (kind || null) as TransactionKind | null,
      addTagIds,
      origin: rule?.origin ?? "manual",
    });
    onClose();
  }

  return (
    <div className="space-y-5">
      <p className="text-lg font-semibold">{rule ? "Edit rule" : "New rule"}</p>

      <Field label="When description">
        <div className="flex gap-2">
          <Select value={matchMode} onValueChange={(v) => setMatchMode(v as MatchMode)}>
            <SelectTrigger className="w-36 shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>{MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
          <Input value={matchText} onChange={(e) => setMatchText(e.target.value)} placeholder="e.g. ica supermar" className="flex-1" />
        </div>
      </Field>

      <Field label="Set category">
        <Select value={categoryId || NONE} onValueChange={(v) => setCategoryId(v === NONE ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="(leave as-is)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>(leave as-is)</SelectItem>
            {orderCategories(categories).map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.parentId ? "↳ " : ""}{c.icon} {c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Set kind">
        <Select value={kind || NONE} onValueChange={(v) => setKind(v === NONE ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="(leave as-is)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>(leave as-is)</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field label="Add tags">
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => {
            const on = addTagIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setAddTagIds((cur) => (on ? cur.filter((x) => x !== t.id) : [...cur, t.id]))}
                className={on ? "rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground" : "rounded-full glass-inset px-2.5 py-1 text-xs text-muted-foreground"}
              >
                {t.name}
              </button>
            );
          })}
        </div>
      </Field>

      <div className="flex items-center justify-between pt-1">
        {rule ? (
          <Button variant="danger" size="sm" onClick={() => { removeRule(rule.id); onClose(); }} className="gap-1.5">
            <Trash2 className="size-4" /> Delete
          </Button>
        ) : <span />}
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={!canSave}>Save</Button>
        </div>
      </div>
    </div>
  );
}
