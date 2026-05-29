"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Landmark, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AccountEditor } from "@/components/accounts/account-editor";
import { useData } from "@/store/data";
import { useMediaQuery } from "@/lib/use-media-query";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

export default function AccountsPage() {
  const { accounts, transactions } = useData();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedAccount = selectedId && selectedId !== "new" ? accounts.find((a) => a.id === selectedId) ?? null : null;
  const editor = <AccountEditor key={selectedId} account={selectedAccount} onClose={() => setSelectedId(null)} />;
  const countFor = (id: string) => transactions.filter((t) => t.accountId === id).length;

  return (
    <>
      <PageHeader title="Accounts" subtitle="Manage your accounts. Insights live on the dashboard." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(360px,400px)]">
        {/* List */}
        <div className="space-y-2">
          {accounts.map((a) => {
            const n = countFor(a.id);
            return (
              <button
                key={a.id}
                onClick={() => setSelectedId(a.id)}
                className={cn(
                  "pressable flex w-full items-center gap-3 rounded-glass glass p-4 text-left",
                  a.archived && "opacity-60",
                  isDesktop && selectedId === a.id && "ring-1 ring-primary/50",
                )}
              >
                <span className="grid size-10 place-items-center rounded-full text-lg" style={{ backgroundColor: `hsl(${a.color} / 0.14)` }}>
                  {a.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-semibold">{a.name}</span>
                    {a.kind === "savings" && (
                      <span className="shrink-0 rounded-full bg-[hsl(var(--positive)/0.16)] px-2 py-0.5 text-[10px] font-medium text-positive">Savings</span>
                    )}
                    {a.archived && <span className="shrink-0 text-[10px] text-muted-foreground">Archived</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">{a.type} · {n} transaction{n === 1 ? "" : "s"}</span>
                </span>
              </button>
            );
          })}

          <button
            onClick={() => setSelectedId("new")}
            className="pressable flex w-full items-center justify-center gap-2 rounded-glass glass-inset p-4 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-4" /> New account
          </button>
        </div>

        {/* Desktop editor */}
        <Card className="hidden h-fit lg:sticky lg:top-6 lg:block">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={selectedId ?? "empty"} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={spring}>
              {selectedId ? editor : <EditorEmpty onNew={() => setSelectedId("new")} />}
            </motion.div>
          </AnimatePresence>
        </Card>
      </div>

      {/* Mobile sheet */}
      <Dialog open={!isDesktop && selectedId !== null} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent title={selectedAccount ? "Edit account" : "New account"}>{editor}</DialogContent>
      </Dialog>
    </>
  );
}

function EditorEmpty({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <Landmark className="size-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Pick an account to edit, or create a new one.</p>
      <Button size="sm" variant="glass" onClick={onNew} className="gap-1.5">
        <Plus className="size-4" /> New account
      </Button>
    </div>
  );
}
