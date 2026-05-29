"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Plus, Tag as TagIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { TagEditor } from "@/components/tags/tag-editor";
import { useData } from "@/store/data";
import { useMediaQuery } from "@/lib/use-media-query";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

export default function TagsPage() {
  const { tags, transactions } = useData();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedTag = selectedId && selectedId !== "new" ? tags.find((t) => t.id === selectedId) ?? null : null;
  const editor = <TagEditor key={selectedId} tag={selectedTag} onClose={() => setSelectedId(null)} />;
  const countFor = (id: string) => transactions.filter((t) => t.tagIds.includes(id)).length;

  return (
    <>
      <PageHeader title="Tags" subtitle="Manage tags to group related transactions. Insights live on the dashboard." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(360px,400px)]">
        {/* List */}
        <div className="space-y-2">
          {tags.map((t) => {
            const n = countFor(t.id);
            return (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={cn(
                  "pressable flex w-full items-center gap-3 rounded-glass glass p-4 text-left",
                  isDesktop && selectedId === t.id && "ring-1 ring-primary/50",
                )}
              >
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: `hsl(${t.color})` }} />
                <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                <span className="tnum shrink-0 text-sm text-muted-foreground">{n} txs</span>
              </button>
            );
          })}

          <button
            onClick={() => setSelectedId("new")}
            className="pressable flex w-full items-center justify-center gap-2 rounded-glass glass-inset p-4 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-4" /> New tag
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
        <DialogContent title={selectedTag ? "Edit tag" : "New tag"}>{editor}</DialogContent>
      </Dialog>
    </>
  );
}

function EditorEmpty({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <TagIcon className="size-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Pick a tag to edit, or create a new one.</p>
      <Button size="sm" variant="glass" onClick={onNew} className="gap-1.5">
        <Plus className="size-4" /> New tag
      </Button>
    </div>
  );
}
