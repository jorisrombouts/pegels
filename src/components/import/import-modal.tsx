"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Upload, Loader2, Search } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useData } from "@/store/data";
import { useUI } from "@/store/ui";
import { parseCsv, parseAmount, parseDate, cleanDescription, type ColumnField, type ParsedCsv } from "@/lib/parse-csv";
import { isRevolutCsv, normalizeRevolut } from "@/lib/parse-revolut";
import { needsReview } from "@/lib/categorize";
import { categorizeTransactions, logImportExamples } from "@/app/actions/ai";
import { detectTransfersOnImport, orderCategories, type ExistingTransferUpdate } from "@/lib/domain/selectors";
import { formatSEK } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Transaction, TransactionKind } from "@/lib/domain/types";

interface DraftRow {
  date: string;
  description: string;
  amount: number;
  categoryId: string | null;
  confidence: number;
  tagIds: string[];
  include: boolean;
  kind: TransactionKind;
  goalId: string | null;
  // Original AI prediction, kept separate from the user-editable values above.
  predictedKind: TransactionKind | null;
  predictedCategoryId: string | null;
  predictedConfidence: number | null;
}

const FIELD_LABEL: Record<ColumnField, string> = { date: "Date", description: "Description", amount: "Amount" };

export function ImportModal() {
  const router = useRouter();
  const { accounts, categories, transactions, goals, addTransactions, updateTransaction } = useData();
  const importOpen = useUI((s) => s.importOpen);
  const setImportOpen = useUI((s) => s.setImportOpen);

  const [step, setStep] = useState<"upload" | "review">("upload");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState({ date: 0, description: 1, amount: 2 });
  const [rows, setRows] = useState<DraftRow[]>([]);

  // The modal mounts globally before the Query data loads, so `accounts` is empty at first
  // render. Derive the "Import into" account (default to the first spending account) instead
  // of syncing it via an effect, so it's correct as soon as accounts arrive.
  const [pickedAccountId, setPickedAccountId] = useState("");
  const accountId = pickedAccountId || accounts.find((a) => a.kind === "spending")?.id || accounts[0]?.id || "";
  const revolutDetected = parsed ? isRevolutCsv(parsed.headers) : false;
  const [existingUpdates, setExistingUpdates] = useState<ExistingTransferUpdate[]>([]);
  const [categorizing, setCategorizing] = useState(false);
  const [kindFilter, setKindFilter] = useState<"all" | TransactionKind>("all");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [uncategorizedOnly, setUncategorizedOnly] = useState(false);
  const [hideDuplicates, setHideDuplicates] = useState(false);
  const [search, setSearch] = useState("");

  function reset() {
    setStep("upload");
    setParsed(null);
    setFileName("");
    setRows([]);
    setExistingUpdates([]);
    setCategorizing(false);
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

  async function buildRows(): Promise<DraftRow[]> {
    if (!parsed) return [];
    const existing = new Set(
      transactions.filter((t) => t.accountId === accountId).map((t) => `${t.date}|${t.amount}|${t.description}`),
    );
    // `forcedKind` is decided by Revolut's Type column: "transfer" skips the LLM entirely;
    // "expense" still gets categorized but keeps its kind; null means full LLM (SEB + unknown types).
    const base: { date: string; description: string; amount: number; forcedKind: TransactionKind | null }[] =
      isRevolutCsv(parsed.headers)
        ? normalizeRevolut(parsed).map((r) => ({ date: r.date, description: r.description, amount: r.amount, forcedKind: r.kind }))
        : parsed.rows.map((r) => ({
            date: parseDate(r[mapping.date] ?? ""),
            description: cleanDescription(r[mapping.description] ?? ""),
            amount: parseAmount(r[mapping.amount] ?? ""),
            forcedKind: null,
          }));
    // One AI pass for every row that still needs it (transfers are already decided). `index` is the
    // row's position in `base`; categorizeTransactions echoes it back and tolerates the gaps.
    const ai = await categorizeTransactions(
      base
        .map((b, i) => ({ index: i, description: b.description, amount: b.amount, forcedKind: b.forcedKind }))
        .filter((b) => b.forcedKind !== "transfer")
        .map(({ index, description, amount }) => ({ index, description, amount })),
    );
    const drafts = base.map((b, i) => {
      const isTransfer = b.forcedKind === "transfer";
      const res = isTransfer ? undefined : ai.find((a) => a.index === i);
      const isDup = existing.has(`${b.date}|${b.amount}|${b.description}`);
      return {
        id: String(i),
        date: b.date,
        description: b.description,
        amount: b.amount,
        accountId,
        categoryId: isTransfer ? null : res?.categoryId ?? null,
        confidence: isTransfer ? 1 : res?.confidence ?? 0.4,
        tagIds: isTransfer ? [] : res?.addTagIds ?? [],
        include: !isDup,
        kind: (b.forcedKind ?? res?.kind ?? (b.amount < 0 ? "expense" : "income")) as TransactionKind,
        goalId: null as string | null,
        predictedKind: (b.forcedKind ?? res?.kind ?? null) as TransactionKind | null,
        predictedCategoryId: isTransfer ? null : res?.categoryId ?? null,
        predictedConfidence: isTransfer ? 1 : res?.confidence ?? null,
      };
    });
    // Pair each new row against existing transactions (the other leg arrived in a prior import).
    const detected = detectTransfersOnImport(drafts as unknown as Transaction[], transactions, goals);
    setExistingUpdates(detected.existingUpdates);
    return drafts.map((d, i): DraftRow => ({
      date: d.date, description: d.description, amount: d.amount, categoryId: d.categoryId,
      confidence: d.confidence, tagIds: d.tagIds, include: d.include, kind: detected.rows[i].kind, goalId: detected.rows[i].goalId,
      predictedKind: d.predictedKind, predictedCategoryId: d.predictedCategoryId, predictedConfidence: d.predictedConfidence,
    }));
  }

  async function handleContinue() {
    setCategorizing(true);
    try {
      const built = await buildRows();
      setRows(built);
      setStep("review");
    } finally {
      setCategorizing(false);
    }
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
  const kindCounts = { expense: 0, income: 0, transfer: 0 } as Record<TransactionKind, number>;
  included.forEach((r) => { kindCounts[r.kind] += 1; });
  const kindTotals = { expense: 0, income: 0, transfer: 0 } as Record<TransactionKind, number>;
  rows.forEach((r) => { kindTotals[r.kind] += 1; });
  const reviewTotal = rows.filter((r) => needsReview(r.confidence)).length;
  const isUncategorized = (r: DraftRow) => r.kind === "expense" && !r.categoryId;
  const uncategorizedTotal = rows.filter(isUncategorized).length;
  const query = search.trim().toLowerCase();
  const matchesFilters = (r: DraftRow) =>
    (kindFilter === "all" || r.kind === kindFilter) &&
    (!reviewOnly || needsReview(r.confidence)) &&
    (!uncategorizedOnly || isUncategorized(r)) &&
    (!hideDuplicates || !isDup(r)) &&
    (!query || r.description.toLowerCase().includes(query));
  const visibleCount = rows.filter(matchesFilters).length;
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
      kind: r.kind,
      goalId: r.goalId,
    }));
    addTransactions(txs);
    // Log the AI's prediction vs. the user's final choice for the feedback loop (fire-and-forget).
    void logImportExamples(
      included.map((r) => ({
        rawDescription: r.description,
        cleanedDescription: r.description,
        amount: r.amount,
        predictedKind: r.predictedKind,
        predictedCategoryId: r.predictedCategoryId,
        predictedConfidence: r.predictedConfidence,
        finalKind: r.kind,
        finalCategoryId: r.categoryId,
      })),
    );
    // Reclassify each matched existing leg as a transfer (and link/unlink its goal).
    existingUpdates.forEach((u) => updateTransaction(u.id, { kind: "transfer", goalId: u.goalId }));
    setImportOpen(false);
    reset();
    router.push("/transactions");
  }

  return (
    <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) reset(); }}>
      <DialogContent title="Import Transactions" description="Review and edit before importing. Duplicates are auto-skipped." className="sm:max-w-3xl">

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

                {revolutDetected ? (
                  <div className="rounded-2xl glass-inset p-4 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Revolut statement detected.</span> Fees are folded into
                    the amount, only completed transactions are imported, top-ups and exchanges are skipped, and the
                    transaction type sets transfers automatically.
                  </div>
                ) : (
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
                )}

                <Field label="Import into">
                  <Select value={accountId} onValueChange={setPickedAccountId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.icon} {a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <div className="flex justify-end">
                  <Button onClick={handleContinue} disabled={!accountId || categorizing}>
                    {categorizing ? (<><Loader2 className="size-4 animate-spin" /> Categorizing…</>) : "Continue"}
                  </Button>
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
              <Stat label="Types" value={`${kindCounts.expense} expense · ${kindCounts.transfer} transfer · ${kindCounts.income} income`} />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-1.5">
              {([
                ["all", "All", rows.length],
                ["expense", "Expense", kindTotals.expense],
                ["transfer", "Transfer", kindTotals.transfer],
                ["income", "Income", kindTotals.income],
              ] as const).map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setKindFilter(key)}
                  className={cn(
                    "pressable rounded-full px-3 py-1 text-xs font-medium",
                    kindFilter === key ? "bg-primary text-primary-foreground" : "glass-inset text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label} <span className="tnum opacity-70">{count}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setReviewOnly((v) => !v)}
                className={cn(
                  "pressable rounded-full px-3 py-1 text-xs font-medium",
                  reviewOnly ? "bg-[hsl(var(--warning))] text-white" : "glass-inset text-muted-foreground hover:text-foreground",
                )}
              >
                Needs review <span className="tnum opacity-70">{reviewTotal}</span>
              </button>
              <button
                type="button"
                onClick={() => setUncategorizedOnly((v) => !v)}
                className={cn(
                  "pressable rounded-full px-3 py-1 text-xs font-medium",
                  uncategorizedOnly ? "bg-primary text-primary-foreground" : "glass-inset text-muted-foreground hover:text-foreground",
                )}
              >
                Uncategorized <span className="tnum opacity-70">{uncategorizedTotal}</span>
              </button>
              <button
                type="button"
                onClick={() => setHideDuplicates((v) => !v)}
                className={cn(
                  "pressable rounded-full px-3 py-1 text-xs font-medium",
                  hideDuplicates ? "bg-primary text-primary-foreground" : "glass-inset text-muted-foreground hover:text-foreground",
                )}
              >
                Hide duplicates <span className="tnum opacity-70">{dupCount}</span>
              </button>
              <div className="relative ml-auto w-full sm:w-auto">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search description"
                  className="w-full py-1 pl-8 pr-2 text-xs sm:w-48"
                />
              </div>
            </div>

            {/* Review table */}
            <div className="max-h-[44vh] overflow-y-auto rounded-2xl border border-[hsl(var(--glass-border))]">
              {visibleCount === 0 && (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">No rows match these filters.</p>
              )}
              {rows.map((r, i) => {
                if (!matchesFilters(r)) return null;
                const dup = isDup(r);
                return (
                  <div key={i} className={cn("flex flex-wrap items-center gap-2 border-b border-[hsl(var(--glass-border))] px-3 py-2 last:border-0 sm:flex-nowrap", dup && "opacity-60")}>
                    {/* On phones this wraps to 3 lines: [date · amount] / [description] / [kind · category].
                        sm:order-* restores the desktop column order (date, description, amount, kind, category). */}
                    <input
                      type="checkbox"
                      checked={r.include}
                      onChange={(e) => update(i, { include: e.target.checked })}
                      className="size-4 shrink-0 accent-[hsl(var(--primary))]"
                      aria-label={`Include ${r.description}`}
                    />
                    <Input type="date" value={r.date} onChange={(e) => update(i, { date: e.target.value })} className="min-w-0 flex-1 px-2 py-1 text-xs sm:order-1 sm:w-32 sm:flex-none" />
                    <Input value={String(r.amount)} onChange={(e) => update(i, { amount: parseAmount(e.target.value) })} className="w-24 shrink-0 px-2 py-1 text-right text-sm tnum sm:order-3" />
                    <div className="w-full min-w-0 sm:order-2 sm:w-auto sm:flex-1">
                      <Input value={r.description} onChange={(e) => update(i, { description: e.target.value })} className={cn("px-2 py-1 text-sm", dup && "line-through")} />
                      {dup && <span className="ml-1 text-[10px] text-muted-foreground">Duplicate of existing</span>}
                    </div>
                    <Select value={r.kind} onValueChange={(v) => update(i, { kind: v as TransactionKind })}>
                      <SelectTrigger className="flex-1 px-2 py-1 text-xs sm:order-4 sm:w-28 sm:flex-none"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="expense">Expense</SelectItem>
                        <SelectItem value="transfer">Transfer</SelectItem>
                        <SelectItem value="income">Income</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:order-5 sm:w-44 sm:flex-none">
                      {r.kind === "expense" ? (
                        <>
                          <Select value={r.categoryId ?? ""} onValueChange={(v) => update(i, { categoryId: v, confidence: 1 })}>
                            <SelectTrigger className="min-w-0 flex-1 px-2 py-1 text-xs"><SelectValue placeholder="Uncategorized" /></SelectTrigger>
                            <SelectContent>
                              {orderCategories(categories).map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.parentId ? "↳ " : ""}{c.icon} {c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            title={`${Math.round(r.confidence * 100)}% confidence`}
                            style={{ backgroundColor: r.confidence >= 0.85 ? "hsl(var(--positive))" : r.confidence >= 0.6 ? "hsl(var(--warning))" : "hsl(var(--negative))" }}
                          />
                        </>
                      ) : (
                        <span className="px-1 text-xs text-muted-foreground">—</span>
                      )}
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
