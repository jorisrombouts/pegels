"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useData } from "@/store/data";
import { buildMaps } from "@/lib/domain/selectors";
import { suggestRulesFromMonth } from "@/lib/rules";
import type { CategorizationRule } from "@/lib/domain/types";

/** Months present in the data, newest first, as "yyyy-mm". */
function dataMonths(dates: string[]): string[] {
  return Array.from(new Set(dates.map((d) => d.slice(0, 7)))).sort().reverse();
}

export function RuleSuggestions({ onApproved }: { onApproved: () => void }) {
  const { transactions, categories, rules, upsertRule } = useData();
  const categoryById = buildMaps(categories).categoryById;
  const months = useMemo(() => dataMonths(transactions.map((t) => t.date)), [transactions]);
  const [month, setMonth] = useState(months[0] ?? "");
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const suggestions = useMemo(
    () => (month ? suggestRulesFromMonth(transactions, month, rules) : []),
    [transactions, month, rules],
  );

  function toggle(i: number) {
    setChecked((cur) => { const n = new Set(cur); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  }

  function approve() {
    const base = rules.reduce((m, r) => Math.max(m, r.priority), 0);
    let p = base;
    suggestions.forEach((s, i) => {
      if (!checked.has(i)) return;
      p += 10;
      const r: CategorizationRule = {
        id: `rule-${Date.now()}-${i}`, priority: p, enabled: true,
        matchText: s.matchText, matchMode: s.matchMode,
        setCategoryId: s.setCategoryId, setKind: s.setKind, addTagIds: s.addTagIds, origin: "suggested",
      };
      upsertRule(r);
    });
    setChecked(new Set());
    onApproved();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Suggest from</span>
        <Select value={month} onValueChange={(v) => { setMonth(v); setChecked(new Set()); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Pick a month" /></SelectTrigger>
          <SelectContent>{months.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {suggestions.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No new rule suggestions for this month.</p>
      ) : (
        <div className="space-y-1">
          {suggestions.map((s, i) => {
            const cat = s.setCategoryId ? categoryById.get(s.setCategoryId) : undefined;
            return (
              <label key={i} className="flex items-center gap-2 rounded-xl glass-inset px-3 py-2 text-sm">
                <input type="checkbox" checked={checked.has(i)} onChange={() => toggle(i)} className="size-4 accent-[hsl(var(--primary))]" />
                <span className="flex-1 truncate">
                  <span className="text-muted-foreground">contains</span> “{s.matchText}” → {cat ? `${cat.icon} ${cat.name}` : s.setKind ?? "(tags)"}
                  {s.addTagIds.length > 0 && <span className="text-muted-foreground"> +{s.addTagIds.length} tag</span>}
                </span>
                {s.risky && <AlertTriangle className="size-4 shrink-0 text-[hsl(var(--warning))]" aria-label="Short match — review before approving" />}
                <span className="tnum shrink-0 text-xs text-muted-foreground">×{s.count}</span>
              </label>
            );
          })}
          <div className="flex justify-end pt-2">
            <Button size="sm" onClick={approve} disabled={checked.size === 0}>Approve {checked.size || ""} selected</Button>
          </div>
        </div>
      )}
    </div>
  );
}
