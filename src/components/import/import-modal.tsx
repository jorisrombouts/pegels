"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Upload } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useData } from "@/store/data";
import { useUI } from "@/store/ui";
import { parseCsv, parseAmount, parseDate, type ColumnField, type ParsedCsv } from "@/lib/parse-csv";
import { categorize, needsReview } from "@/lib/categorize";
import { formatSEK } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Transaction } from "@/lib/domain/types";

interface DraftRow {
  date: string;
  description: string;
  amount: number;
  categoryId: string | null;
  confidence: number;
  tagIds: string[];
  include: boolean;
}

const FIELD_LABEL: Record<ColumnField, string> = { date: "Date", description: "Description", amount: "Amount" };

export function ImportModal() {
  const router = useRouter();
  const { accounts, categories, transactions, addTransactions } = useData();
  const importOpen = useUI((s) => s.importOpen);
  const setImportOpen = useUI((s) => s.setImportOpen);

  const [step, setStep] = useState<"upload" | "review">("upload");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState({ date: 0, description: 1, amount: 2 });
  const [accountId, setAccountId] = useState(accounts.find((a) => a.kind === "spending")?.id ?? accounts[0]?.id ?? "");
  const [rows, setRows] = useState<DraftRow[]>([]);

  function reset() {
    setStep("upload");
    setParsed(null);
    setFileName("");
    setRows([]);
  }

  function loadText(text: string, name: string) {
    const p = parseCsv(text);
    setParsed(p);
    setMapping(p.mapping);
    setFileName(name);
  }

  async function handleFile(file: File) {
    loadText(await file.text(), file.name);
  }

  async function useSample() {
    const res = await fetch("/mock-imports/seb-april-2025.csv");
    loadText(await res.text(), "seb-april-2025.csv (sample)");
  }

  function buildRows(): DraftRow[] {
    if (!parsed) return [];
    const existing = new Set(
      transactions.filter((t) => t.accountId === accountId).map((t) => `${t.date}|${t.amount}|${t.description}`),
    );
    return parsed.rows.map((r) => {
      const date = parseDate(r[mapping.date] ?? "");
      const description = r[mapping.description] ?? "";
      const amount = parseAmount(r[mapping.amount] ?? "");
      const { categoryId, confidence } = categorize(description);
      const isDup = existing.has(`${date}|${amount}|${description}`);
      return { date, description, amount, categoryId, confidence, tagIds: [], include: !isDup };
    });
  }

  const existingKeys = new Set(
    transactions.filter((t) => t.accountId === accountId).map((t) => `${t.date}|${t.amount}|${t.description}`),
  );
  const isDup = (r: DraftRow) => existingKeys.has(`${r.date}|${r.amount}|${r.description}`);

  // Live summary over the current draft.
  const included = rows.filter((r) => r.include);
  const dupCount = rows.filter(isDup).length;
  const reviewCount = included.filter((r) => needsReview(r.confidence)).length;
  const moneyIn = included.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const moneyOut = included.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0);
  const dates = rows.map((r) => r.date).filter(Boolean).sort();

  function update(i: number, patch: Partial<DraftRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function confirmImport() {
    const txs: Transaction[] = included.map((r, i) => ({
      id: `tx-imp-${Date.now()}-${i}`,
      date: r.date,
      description: r.description,
      amount: r.amount,
      accountId,
      categoryId: r.categoryId,
      predictedCategoryId: r.categoryId,
      categoryConfidence: r.confidence,
      categorySource: "model",
      needsReview: needsReview(r.confidence),
      tagIds: r.tagIds,
      ignored: false,
    }));
    addTransactions(txs);
    setImportOpen(false);
    reset();
    router.push("/transactions");
  }

  return (
    <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) reset(); }}>
      <DialogContent title="Import Transactions" className="sm:max-w-3xl">
        <p className="-mt-3 mb-4 text-sm text-muted-foreground">Review and edit before importing. Duplicates are auto-skipped.</p>

        {step === "upload" ? (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <label className="pressable inline-flex cursor-pointer items-center gap-2 rounded-full glass px-4 py-2.5 text-sm font-medium">
                <Upload className="size-4" /> Choose CSV file
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
              </label>
              <Button variant="glass" onClick={useSample}>Use sample</Button>
            </div>

            {parsed && (
              <>
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="size-4" /> {fileName} · {parsed.rows.length} rows detected
                </p>

                <div className="space-y-3">
                  <span className="text-xs font-medium text-muted-foreground">Column mapping (auto-detected — adjust if needed)</span>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {(["date", "description", "amount"] as ColumnField[]).map((field) => (
                      <Field key={field} label={FIELD_LABEL[field]}>
                        <Select value={String(mapping[field])} onValueChange={(v) => setMapping((m) => ({ ...m, [field]: Number(v) }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {parsed.headers.map((h, i) => (
                              <SelectItem key={i} value={String(i)}>{h || `Column ${i + 1}`}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    ))}
                  </div>
                </div>

                <Field label="Import into">
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.icon} {a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <div className="flex justify-end">
                  <Button onClick={() => { setRows(buildRows()); setStep("review"); }} disabled={!accountId}>Continue</Button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="size-4" /> {fileName} · {parsed?.rows.length ?? 0} rows detected
            </p>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-2xl glass-inset p-4 sm:grid-cols-4">
              <Stat label="Will import" value={`${included.length} / ${rows.length}`} />
              <Stat label="Duplicates skipped" value={String(dupCount)} tone={dupCount ? "warning" : undefined} />
              <Stat label="Date range" value={dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : "—"} />
              <Stat label="Needs review" value={String(reviewCount)} tone={reviewCount ? "warning" : undefined} />
              <Stat label="Money in" value={formatSEK(moneyIn)} tone="positive" />
              <Stat label="Money out" value={formatSEK(moneyOut)} />
              <Stat label="Net" value={formatSEK(moneyIn + moneyOut)} tone={moneyIn + moneyOut >= 0 ? "positive" : undefined} />
              <Stat label="Account rows" value={String(rows.length)} />
            </div>

            {/* Review table */}
            <div className="max-h-[44vh] overflow-y-auto rounded-2xl border border-[hsl(var(--glass-border))]">
              {rows.map((r, i) => {
                const dup = isDup(r);
                return (
                  <div key={i} className={cn("flex items-center gap-2 border-b border-[hsl(var(--glass-border))] px-3 py-2 last:border-0", dup && "opacity-60")}>
                    <input
                      type="checkbox"
                      checked={r.include}
                      onChange={(e) => update(i, { include: e.target.checked })}
                      className="size-4 shrink-0 accent-[hsl(var(--primary))]"
                      aria-label={`Include ${r.description}`}
                    />
                    <Input type="date" value={r.date} onChange={(e) => update(i, { date: e.target.value })} className="w-32 shrink-0 px-2 py-1 text-xs" />
                    <div className="min-w-0 flex-1">
                      <Input value={r.description} onChange={(e) => update(i, { description: e.target.value })} className={cn("px-2 py-1 text-sm", dup && "line-through")} />
                      {dup && <span className="ml-1 text-[10px] text-muted-foreground">Duplicate of existing</span>}
                    </div>
                    <Input value={String(r.amount)} onChange={(e) => update(i, { amount: parseAmount(e.target.value) })} className="w-24 shrink-0 px-2 py-1 text-right text-sm tnum" />
                    <div className="flex w-44 shrink-0 items-center gap-1.5">
                      <Select value={r.categoryId ?? ""} onValueChange={(v) => update(i, { categoryId: v, confidence: 1 })}>
                        <SelectTrigger className="px-2 py-1 text-xs"><SelectValue placeholder="Uncategorized" /></SelectTrigger>
                        <SelectContent>
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.parentId ? "↳ " : ""}{c.icon} {c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        title={`${Math.round(r.confidence * 100)}% confidence`}
                        style={{ backgroundColor: r.confidence >= 0.85 ? "hsl(var(--positive))" : r.confidence >= 0.6 ? "hsl(var(--warning))" : "hsl(var(--negative))" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between">
              <Button variant="glass" onClick={() => setStep("upload")}>Back</Button>
              <Button onClick={confirmImport} disabled={included.length === 0}>Import {included.length} rows</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "positive" | "warning" }) {
  const color = tone === "positive" ? "hsl(var(--positive))" : tone === "warning" ? "hsl(var(--warning))" : undefined;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="tnum text-sm font-semibold" style={{ color }}>{value}</p>
    </div>
  );
}
