"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Search, Split } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TransactionRow } from "@/components/transactions/transaction-row";
import { TransactionDetail, DetailEmpty } from "@/components/transactions/transaction-detail";
import { useData } from "@/store/data";
import { useUI } from "@/store/ui";
import { useMediaQuery } from "@/lib/use-media-query";
import { spring } from "@/lib/motion";
import { MonthSwitcher } from "@/components/month-switcher";
import { inMonth, isInCategory, monthNet } from "@/lib/domain/selectors";
import { formatSEK } from "@/lib/format";
import { cn } from "@/lib/utils";

interface InitialFilters {
  category: string;
  account: string;
  tag: string;
  budget: string;
  review: boolean;
  splits: boolean;
  tx: string | null;
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={null}>
      <TransactionsRoute />
    </Suspense>
  );
}

/** Reads the URL filters, then remounts the view (via `key`) whenever they change. */
function TransactionsRoute() {
  const params = useSearchParams();
  const initial: InitialFilters = {
    category: params.get("category") ?? "all",
    account: params.get("account") ?? "all",
    tag: params.get("tag") ?? "all",
    budget: params.get("budget") ?? "all",
    review: params.get("review") === "1",
    splits: params.get("splits") === "1",
    tx: params.get("tx"),
  };
  return <TransactionsView key={params.toString()} initial={initial} />;
}

function TransactionsView({ initial }: { initial: InitialFilters }) {
  const { transactions, categories, accounts, tags, budgets } = useData();
  const { month, masked } = useUI();
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(initial.category);
  const [accountFilter, setAccountFilter] = useState(initial.account);
  const [tagFilter, setTagFilter] = useState(initial.tag);
  const [budgetFilter, setBudgetFilter] = useState(initial.budget);
  const [needsReviewOnly, setNeedsReviewOnly] = useState(initial.review);
  const [hasSplitsOnly, setHasSplitsOnly] = useState(initial.splits);
  const [selectedId, setSelectedId] = useState<string | null>(initial.tx);

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const budgetCategoryId = budgetFilter === "all" ? null : budgets.find((b) => b.id === budgetFilter)?.categoryId ?? null;

  const monthTxs = transactions.filter((t) => inMonth(t, month));
  const count = monthTxs.length;
  const net = monthNet(transactions, month);

  const filtered = monthTxs
    .filter((t) => {
      if (search && !t.description.toLowerCase().includes(search.toLowerCase())) return false;
      if (categoryFilter !== "all" && !isInCategory(t.categoryId, categoryFilter, categoryById)) return false;
      if (budgetCategoryId && !isInCategory(t.categoryId, budgetCategoryId, categoryById)) return false;
      if (accountFilter !== "all" && t.accountId !== accountFilter) return false;
      if (tagFilter !== "all" && !t.tagIds.includes(tagFilter)) return false;
      if (needsReviewOnly && !t.needsReview) return false;
      if (hasSplitsOnly && !(t.splits && t.splits.length > 0)) return false;
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  return (
    <>
      <PageHeader title="Transactions" />

      {/* Search */}
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" spellCheck={false} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search transactions…" className="h-12 pl-10" />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <PillSelect value={categoryFilter} onChange={setCategoryFilter} placeholder="All categories">
          <SelectItem value="all">All categories</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.parentId ? "↳ " : ""}
              {c.icon} {c.name}
            </SelectItem>
          ))}
        </PillSelect>
        <PillSelect value={budgetFilter} onChange={setBudgetFilter} placeholder="All budgets">
          <SelectItem value="all">All budgets</SelectItem>
          {budgets.map((b) => {
            const c = categoryById.get(b.categoryId);
            return (
              <SelectItem key={b.id} value={b.id}>
                {c ? `${c.icon} ${c.name}` : "Budget"}
              </SelectItem>
            );
          })}
        </PillSelect>
        <PillSelect value={accountFilter} onChange={setAccountFilter} placeholder="All accounts">
          <SelectItem value="all">All accounts</SelectItem>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.icon} {a.name}
            </SelectItem>
          ))}
        </PillSelect>
        <PillSelect value={tagFilter} onChange={setTagFilter} placeholder="All tags">
          <SelectItem value="all">All tags</SelectItem>
          {tags.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </PillSelect>
        <TogglePill active={needsReviewOnly} onClick={() => setNeedsReviewOnly((v) => !v)} icon={<AlertTriangle className="size-4" />} label="Needs review" />
        <TogglePill active={hasSplitsOnly} onClick={() => setHasSplitsOnly((v) => !v)} icon={<Split className="size-4" />} label="Has splits" />
      </div>

      {/* Month nav */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <MonthSwitcher suffix={count} />
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="tnum cursor-default text-sm font-semibold text-muted-foreground">
              Net {formatSEK(net, masked)}
            </span>
          </TooltipTrigger>
          <TooltipContent>Net of included transactions (excluded items not counted).</TooltipContent>
        </Tooltip>
      </div>

      {/* Master / detail */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(360px,400px)]">
        <Card className="p-2">
          {filtered.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">No transactions match.</p>
          ) : (
            <div className="flex flex-col">
              {filtered.map((t) => (
                <TransactionRow
                  key={t.id}
                  tx={t}
                  category={t.categoryId ? categoryById.get(t.categoryId) : undefined}
                  selected={isDesktop && selectedId === t.id}
                  onSelect={() => setSelectedId(t.id)}
                  masked={masked}
                />
              ))}
            </div>
          )}
        </Card>

        {/* Desktop side panel — content animates in / cross-fades on switch */}
        <Card className="hidden h-fit lg:sticky lg:top-6 lg:block">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={selectedId ?? "empty"}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={spring}
            >
              {selectedId ? <TransactionDetail txId={selectedId} /> : <DetailEmpty />}
            </motion.div>
          </AnimatePresence>
        </Card>
      </div>

      {/* Mobile sheet */}
      <Dialog open={!isDesktop && !!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent title="Transaction">{selectedId && <TransactionDetail txId={selectedId} />}</DialogContent>
      </Dialog>
    </>
  );
}

function PillSelect({ value, onChange, placeholder, children }: { value: string; onChange: (v: string) => void; placeholder: string; children: React.ReactNode }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-10 w-auto gap-1.5 rounded-full text-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

function TogglePill({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "pressable inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium",
        active ? "bg-primary text-primary-foreground" : "glass text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
