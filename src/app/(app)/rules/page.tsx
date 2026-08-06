"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus, Wand2, Zap } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { RuleEditor } from "@/components/rules/rule-editor";
import { RuleSuggestions } from "@/components/rules/rule-suggestions";
import { useData, DATASET_KEY } from "@/store/data";
import { buildMaps } from "@/lib/domain/selectors";
import { previewRuleBackfill, applyRuleBackfill } from "@/app/actions/ai";
import type { CategorizationRule } from "@/lib/domain/types";

export default function RulesPage() {
  const qc = useQueryClient();
  const { rules, categories, tags, upsertRule, reorderRules } = useData();
  const categoryById = buildMaps(categories).categoryById;
  const tagById = new Map(tags.map((t) => [t.id, t]));
  const ordered = [...rules].sort((a, b) => a.priority - b.priority);

  const [editing, setEditing] = useState<CategorizationRule | null | "new">(null);
  const [showSuggest, setShowSuggest] = useState(false);
  const [backfill, setBackfill] = useState<{ count: number; samples: { description: string }[]; ruleId?: string } | null>(null);

  function move(i: number, dir: -1 | 1) {
    const next = [...ordered];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    reorderRules(next.map((r) => r.id));
  }

  async function openBackfill() {
    setBackfill(await previewRuleBackfill());
  }

  async function openSingle(rule: CategorizationRule) {
    setBackfill({ ...(await previewRuleBackfill(rule.id)), ruleId: rule.id });
  }

  return (
    <>
      <PageHeader title="Rules" subtitle="Auto-categorize transactions before the AI runs." />

      <div className="mb-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setEditing("new")} className="gap-1.5"><Plus className="size-4" /> New rule</Button>
        <Button size="sm" variant="glass" onClick={() => setShowSuggest(true)} className="gap-1.5"><Wand2 className="size-4" /> Generate suggestions</Button>
        <Button size="sm" variant="glass" onClick={openBackfill}>Apply rules to existing…</Button>
      </div>

      <Card className="space-y-1">
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground">
          🔒 own account numbers → Transfer <span className="text-xs">(system · auto)</span>
        </div>
        {ordered.map((r, i) => {
          const cat = r.setCategoryId ? categoryById.get(r.setCategoryId) : undefined;
          return (
            <div key={r.id} className="flex items-center gap-2 rounded-xl glass-inset px-3 py-2">
              <div className="flex flex-col">
                <button aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="pressable text-muted-foreground disabled:opacity-30"><ChevronUp className="size-4" /></button>
                <button aria-label="Move down" disabled={i === ordered.length - 1} onClick={() => move(i, 1)} className="pressable text-muted-foreground disabled:opacity-30"><ChevronDown className="size-4" /></button>
              </div>
              <span className="min-w-0 flex-1 truncate text-sm">
                <span className="text-muted-foreground">{r.matchMode === "contains" ? "contains" : r.matchMode === "startsWith" ? "starts with" : "is"}</span> “{r.matchText}” →{" "}
                {cat ? `${cat.icon} ${cat.name}` : r.setKind ?? ""}{" "}
                {r.setKind && cat ? <span className="text-muted-foreground">· {r.setKind}</span> : null}
                {r.addTagIds.map((id) => <span key={id} className="ml-1 text-xs text-muted-foreground">#{tagById.get(id)?.name ?? id}</span>)}
              </span>
              <Switch checked={r.enabled} onCheckedChange={(v) => upsertRule({ ...r, enabled: v })} aria-label="Enable rule" />
              <button aria-label="Apply rule" title="Apply this rule to existing transactions" onClick={() => openSingle(r)} className="pressable text-muted-foreground"><Zap className="size-4" /></button>
              <button aria-label="Edit rule" onClick={() => setEditing(r)} className="pressable text-muted-foreground"><Pencil className="size-4" /></button>
            </div>
          );
        })}
        {ordered.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No rules yet. Create one or generate suggestions.</p>}
      </Card>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing && editing !== "new" ? "Edit rule" : "New rule"}>
          <RuleEditor rule={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
        </DialogContent>
      </Dialog>

      <Dialog open={showSuggest} onOpenChange={setShowSuggest}>
        <DialogContent title="Suggested rules">
          <RuleSuggestions onApproved={() => setShowSuggest(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={backfill !== null} onOpenChange={(o) => !o && setBackfill(null)}>
        <DialogContent title={backfill?.ruleId ? "Apply this rule to existing transactions" : "Apply rules to existing transactions"}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {backfill?.count ?? 0} existing transaction(s) would change. Rows you corrected by hand are skipped.
            </p>
            {backfill?.samples.length ? (
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                {backfill.samples.map((s, i) => <li key={i} className="truncate">• {s.description}</li>)}
              </ul>
            ) : null}
            <div className="flex justify-end gap-2">
              <DialogClose asChild><Button variant="ghost" size="sm">Cancel</Button></DialogClose>
              {/* Not wrapped in DialogClose: the dialog stays up until the backfill actually lands. */}
              <Button size="sm" disabled={!backfill?.count} onClick={async () => { await applyRuleBackfill(backfill?.ruleId); await qc.invalidateQueries({ queryKey: DATASET_KEY }); setBackfill(null); }}>
                Apply to {backfill?.count ?? 0}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
