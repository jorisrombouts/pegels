"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Upload, Loader2, Search } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IMPORT_BATCH, useData } from "@/store/data";
import { useUI } from "@/store/ui";
import { parseCsv, parseAmount, parseDate, cleanDescription, type ColumnField, type ParsedCsv } from "@/lib/parse-csv";
import { isRevolutCsv, normalizeRevolut } from "@/lib/parse-revolut";
import { convertRowsToSEK, foreignCurrencies } from "@/lib/fx";
import { fetchRatesToSEK } from "@/app/actions/fx";
import { needsReview } from "@/lib/domain/review";
import { categorizeTransactions } from "@/app/actions/ai";
import { recordExamples } from "@/app/actions/corpus";
import { detectTransfersOnImport, orderCategories, type ExistingTransferUpdate } from "@/lib/domain/selectors";
import { formatSEK } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Category, Transaction, TransactionKind } from "@/lib/domain/types";
import type { ConfidenceLevel } from "@/lib/ai/confidence";

interface DraftRow {
  date: string;
  description: string;
  amount: number; // SEK (foreign rows are converted on import)
  currency: string; // original currency; "SEK" for already-SEK rows
  notes?: string; // fx trace, e.g. "-102.00 EUR @ 10.87" — carried to the transaction note
  unconverted?: boolean; // non-SEK row whose rate couldn't be fetched yet (held back from import)
  categoryId: string | null;
  confidence: number;
  level: ConfidenceLevel;
  tagIds: string[];
  include: boolean;
  kind: TransactionKind;
  // Original AI prediction, kept separate from the user-editable values above.
  predictedKind: TransactionKind | null;
  predictedCategoryId: string | null;
  predictedTagIds: string[] | null;
  predictedConfidence: number | null;
}

interface FxInfo {
  ratesToSEK: Record<string, number>; // code → SEK (incl. SEK:1)
  convertedCount: number; // rows converted from a foreign currency
  failedCurrencies: string[]; // non-SEK currencies we couldn't get a rate for (rows held back)
}

const FIELD_LABEL: Record<ColumnField, string> = { date: "Date", description: "Description", amount: "Amount" };

export function ImportModal() {
  const router = useRouter();
  const { accounts, categories, transactions, addTransactions, updateTransaction } = useData();
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
  const [fx, setFx] = useState<FxInfo | null>(null);
  const [retryingFx, setRetryingFx] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep("upload");
    setParsed(null);
    setFileName("");
    setRows([]);
    setExistingUpdates([]);
    setCategorizing(false);
    setFx(null);
    setError(null);
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
    interface BaseRow {
      date: string;
      description: string;
      amount: number; // SEK
      forcedKind: TransactionKind | null;
      currency: string;
      notes?: string;
      unconverted?: boolean;
    }
    let base: BaseRow[];
    if (isRevolutCsv(parsed.headers)) {
      // Revolut rows carry a currency. Convert any non-SEK amount to SEK (today's ECB rate) so the
      // SEK-only model stays correct; a failed fetch leaves those rows `unconverted` (held back below).
      const norm = normalizeRevolut(parsed);
      const foreign = foreignCurrencies(norm);
      let ratesToSEK: Record<string, number> = { SEK: 1 };
      if (foreign.length) {
        try {
          ratesToSEK = await fetchRatesToSEK(foreign);
        } catch {
          ratesToSEK = { SEK: 1 };
        }
      }
      const { rows: conv, unconvertedCurrencies } = convertRowsToSEK(norm, ratesToSEK);
      base = conv.map((r) => ({ date: r.date, description: r.description, amount: r.amount, forcedKind: r.kind, currency: r.currency, notes: r.fxNote, unconverted: r.unconverted }));
      setFx({ ratesToSEK, convertedCount: conv.filter((r) => r.fxNote).length, failedCurrencies: unconvertedCurrencies });
    } else {
      base = parsed.rows.map((r) => ({
        date: parseDate(r[mapping.date] ?? ""),
        description: cleanDescription(r[mapping.description] ?? ""),
        amount: parseAmount(r[mapping.amount] ?? ""),
        forcedKind: null,
        currency: "SEK",
      }));
      setFx(null);
    }
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
        currency: b.currency,
        notes: b.notes,
        unconverted: b.unconverted,
        accountId,
        categoryId: isTransfer ? null : res?.categoryId ?? null,
        confidence: isTransfer ? 1 : res?.confidence ?? 0.4,
        level: (isTransfer ? "high" : res?.level ?? "low") as ConfidenceLevel,
        tagIds: isTransfer ? [] : res?.tagIds ?? [],
        include: !isDup && !b.unconverted, // a row with no exchange rate yet can't be imported
        kind: (b.forcedKind ?? res?.kind ?? (b.amount < 0 ? "expense" : "income")) as TransactionKind,
        predictedKind: (b.forcedKind ?? res?.kind ?? null) as TransactionKind | null,
        predictedCategoryId: isTransfer ? null : res?.categoryId ?? null,
        predictedTagIds: isTransfer ? [] : res?.tagIds ?? null,
        predictedConfidence: isTransfer ? 1 : res?.confidence ?? null,
      };
    });
    // Pair each new row against existing transactions (the other leg arrived in a prior import).
    const detected = detectTransfersOnImport(drafts as unknown as Transaction[], transactions);
    setExistingUpdates(detected.existingUpdates);
    return drafts.map((d, i): DraftRow => ({
      date: d.date, description: d.description, amount: d.amount, currency: d.currency, notes: d.notes, unconverted: d.unconverted,
      categoryId: d.categoryId, confidence: d.confidence, level: d.level, tagIds: d.tagIds, include: d.include, kind: detected.rows[i].kind,
      predictedKind: d.predictedKind, predictedCategoryId: d.predictedCategoryId,
      predictedTagIds: d.predictedTagIds, predictedConfidence: d.predictedConfidence,
    }));
  }

  async function handleContinue() {
    setCategorizing(true);
    setError(null);
    try {
      const built = await buildRows();
      setRows(built);
      setStep("review");
    } catch (e) {
      // Categorization no longer degrades to a keyword guess, so a failure here is real and has
      // to be visible — a silent fallback is how an expired API key went unnoticed.
      console.error("import: categorization failed", e);
      setError(
        "Couldn't categorize these transactions — the AI service didn't respond. " +
          "Check that OPENAI_API_KEY is valid, then try again.",
      );
    } finally {
      setCategorizing(false);
    }
  }

  // Re-fetch rates for the rows held back on a failed FX call, and convert them in place. No
  // re-categorization (those rows were already categorized) — just the amount/note/include flip.
  async function retryFx() {
    setRetryingFx(true);
    try {
      let rates: Record<string, number> = { SEK: 1 };
      try {
        rates = await fetchRatesToSEK(foreignCurrencies(rows.filter((r) => r.unconverted)));
      } catch {
        rates = { SEK: 1 };
      }
      const newRows = rows.map((r): DraftRow => {
        if (!r.unconverted) return r;
        const [c] = convertRowsToSEK([{ date: r.date, description: r.description, amount: r.amount, currency: r.currency, kind: r.kind }], rates).rows;
        if (c.unconverted) return r; // still no rate
        return { ...r, amount: c.amount, notes: c.fxNote, unconverted: false, include: !existingKeys.has(`${r.date}|${c.amount}|${r.description}`) };
      });
      setRows(newRows);
      setFx((f) => ({
        ratesToSEK: { ...(f?.ratesToSEK ?? { SEK: 1 }), ...rates },
        convertedCount: newRows.filter((r) => r.notes).length,
        failedCurrencies: foreignCurrencies(newRows.filter((r) => r.unconverted)),
      }));
    } finally {
      setRetryingFx(false);
    }
  }

  const fxRateLine = (info: FxInfo) =>
    Object.entries(info.ratesToSEK)
      .filter(([c]) => c !== "SEK")
      .map(([c, r]) => `1 ${c} = ${r.toFixed(2)} kr`)
      .join(" · ");

  const existingKeys = new Set(
    transactions.filter((t) => t.accountId === accountId).map((t) => `${t.date}|${t.amount}|${t.description}`),
  );
  const isDup = (r: DraftRow) => existingKeys.has(`${r.date}|${r.amount}|${r.description}`);

  // Live summary over the current draft.
  const included = rows.filter((r) => r.include);
  const dupCount = rows.filter(isDup).length;
  const reviewCount = included.filter((r) => needsReview(r.level)).length;
  const moneyIn = included.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const moneyOut = included.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0);
  const kindCounts = { expense: 0, income: 0, transfer: 0 } as Record<TransactionKind, number>;
  included.forEach((r) => { kindCounts[r.kind] += 1; });
  const kindTotals = { expense: 0, income: 0, transfer: 0 } as Record<TransactionKind, number>;
  rows.forEach((r) => { kindTotals[r.kind] += 1; });
  const reviewTotal = rows.filter((r) => needsReview(r.level)).length;
  const isUncategorized = (r: DraftRow) => r.kind === "expense" && !r.categoryId;
  const uncategorizedTotal = rows.filter(isUncategorized).length;
  const query = search.trim().toLowerCase();
  const matchesFilters = (r: DraftRow) =>
    (kindFilter === "all" || r.kind === kindFilter) &&
    (!reviewOnly || needsReview(r.level)) &&
    (!uncategorizedOnly || isUncategorized(r)) &&
    (!hideDuplicates || !isDup(r)) &&
    (!query || r.description.toLowerCase().includes(query));
  const visibleCount = rows.filter(matchesFilters).length;
  const dates = rows.map((r) => r.date).filter(Boolean).sort();

  // Stable identity (functional `setRows`, so no deps) — every unedited row keeps its object
  // reference and its `ReviewRow` bails out, making a tick or keystroke flat instead of O(rows).
  const update = useCallback((i: number, patch: Partial<DraftRow>) => {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }, []);
  const orderedCategories = useMemo(() => orderCategories(categories), [categories]);

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
      categoryLevel: r.level,
      categorySource: "model",
      needsReview: needsReview(r.level),
      tagIds: r.tagIds,
      kind: r.kind,
      notes: r.notes,
    }));
    addTransactions(txs);
    // The AI's prediction vs. what the user actually kept (fire-and-forget). Rows the user edited
    // become approved corpus evidence; untouched rows are only counted as sightings.
    const examples = included.map((r) => ({
      rawDescription: r.description,
      cleanedDescription: r.description,
      amount: r.amount,
      predictedKind: r.predictedKind,
      predictedCategoryId: r.predictedCategoryId,
      predictedTagIds: r.predictedTagIds,
      predictedConfidence: r.predictedConfidence,
      finalKind: r.kind,
      finalCategoryId: r.categoryId,
      finalTagIds: r.tagIds,
    }));
    // Batched for the same body limit as addTransactions above.
    for (let i = 0; i < examples.length; i += IMPORT_BATCH) {
      void recordExamples(examples.slice(i, i + IMPORT_BATCH), "import").catch((e) =>
        console.error("Failed to log import examples", e),
      );
    }
    // Reclassify each matched existing leg as a transfer.
    existingUpdates.forEach((u) => updateTransaction(u.id, { kind: "transfer" }));
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

                {error && (
                  <p
                    role="alert"
                    className="rounded-xl px-3 py-2 text-sm"
                    style={{ backgroundColor: "hsl(var(--negative) / 0.12)", color: "hsl(var(--negative))" }}
                  >
                    {error}
                  </p>
                )}

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

            {/* Currency conversion notice */}
            {fx && (fx.convertedCount > 0 || fx.failedCurrencies.length > 0) && (
              <div className="rounded-2xl glass-inset p-3 text-xs">
                {fx.convertedCount > 0 && (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">
                      Converted {fx.convertedCount} non-SEK {fx.convertedCount === 1 ? "row" : "rows"} to SEK
                    </span>{" "}
                    at today&apos;s ECB rate ({fxRateLine(fx)}).
                  </p>
                )}
                {fx.failedCurrencies.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="text-[hsl(var(--warning))]">
                      Couldn&apos;t fetch a rate for {fx.failedCurrencies.join(", ")} — those rows are held back.
                    </span>
                    <button
                      type="button"
                      onClick={retryFx}
                      disabled={retryingFx}
                      className="pressable rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                    >
                      {retryingFx ? "Retrying…" : "Retry"}
                    </button>
                  </div>
                )}
              </div>
            )}

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
                return <ReviewRow key={i} row={r} index={i} dup={isDup(r)} categories={orderedCategories} onUpdate={update} />;
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

const ReviewRow = memo(function ReviewRow({ row: r, index: i, dup, categories, onUpdate }: {
  row: DraftRow;
  index: number;
  dup: boolean;
  categories: Category[]; // pre-ordered by the parent
  onUpdate: (i: number, patch: Partial<DraftRow>) => void;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 border-b border-[hsl(var(--glass-border))] px-3 py-2 last:border-0 sm:flex-nowrap", (dup || r.unconverted) && "opacity-60")}>
      {/* On phones this wraps to 3 lines: [date · amount] / [description] / [kind · category].
          sm:order-* restores the desktop column order (date, description, amount, kind, category). */}
      <input
        type="checkbox"
        checked={r.include}
        disabled={r.unconverted}
        onChange={(e) => onUpdate(i, { include: e.target.checked })}
        className="size-4 shrink-0 accent-[hsl(var(--primary))] disabled:opacity-40"
        aria-label={`Include ${r.description}`}
      />
      <Input type="date" value={r.date} onChange={(e) => onUpdate(i, { date: e.target.value })} className="min-w-0 flex-1 px-2 py-1 text-xs sm:order-1 sm:w-32 sm:flex-none" aria-label={`Date for ${r.description}`} />
      <Input value={String(r.amount)} onChange={(e) => onUpdate(i, { amount: parseAmount(e.target.value) })} className="w-24 shrink-0 px-2 py-1 text-right text-sm tnum sm:order-3" aria-label={`Amount for ${r.description}`} />
      <div className="w-full min-w-0 sm:order-2 sm:w-auto sm:flex-1">
        <Input value={r.description} onChange={(e) => onUpdate(i, { description: e.target.value })} className={cn("px-2 py-1 text-sm", dup && "line-through")} aria-label={`Description for ${r.description}`} />
        {dup && <span className="ml-1 text-[10px] text-muted-foreground">Duplicate of existing</span>}
        {r.unconverted && <span className="ml-1 text-[10px] text-[hsl(var(--warning))]">Needs {r.currency} exchange rate</span>}
      </div>
      <Select value={r.kind} onValueChange={(v) => onUpdate(i, { kind: v as TransactionKind })}>
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
            <Select value={r.categoryId ?? ""} onValueChange={(v) => onUpdate(i, { categoryId: v, confidence: 1 })}>
              <SelectTrigger className="min-w-0 flex-1 px-2 py-1 text-xs"><SelectValue placeholder="Uncategorized" /></SelectTrigger>
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
          </>
        ) : (
          <span className="px-1 text-xs text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
});

function Stat({ label, value, tone }: { label: string; value: string; tone?: "positive" | "warning" }) {
  const color = tone === "positive" ? "hsl(var(--positive))" : tone === "warning" ? "hsl(var(--warning))" : undefined;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="tnum text-sm font-semibold" style={{ color }}>{value}</p>
    </div>
  );
}
