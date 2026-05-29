"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Layers, Pencil, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CategoryEditor } from "@/components/categories/category-editor";
import { useData } from "@/store/data";
import { useMediaQuery } from "@/lib/use-media-query";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Sel = { kind: "edit"; id: string } | { kind: "new"; parentId: string | null } | null;

export default function CategoriesPage() {
  const { categories } = useData();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [sel, setSel] = useState<Sel>(null);

  const parents = categories.filter((c) => c.parentId === null);
  const selectedCategory = sel?.kind === "edit" ? categories.find((c) => c.id === sel.id) ?? null : null;
  const editorParentId = sel?.kind === "new" ? sel.parentId : null;
  const selKey = sel?.kind === "edit" ? sel.id : sel?.kind === "new" ? `new-${sel.parentId ?? "top"}` : "empty";
  const isEditingId = (id: string) => isDesktop && sel?.kind === "edit" && sel.id === id;

  const editor = <CategoryEditor key={selKey} category={selectedCategory} parentId={editorParentId} onClose={() => setSel(null)} />;

  return (
    <>
      <PageHeader title="Categories" subtitle="Add, rename, or delete categories and subcategories." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(360px,400px)]">
        {/* List of parent categories */}
        <div className="space-y-3">
          {parents.map((parent) => {
            const children = categories.filter((c) => c.parentId === parent.id);
            return (
              <Card key={parent.id}>
                <button
                  onClick={() => setSel({ kind: "edit", id: parent.id })}
                  className={cn("pressable -m-2 mb-1 flex w-[calc(100%+1rem)] items-center gap-3 rounded-xl p-2 text-left", isEditingId(parent.id) && "ring-1 ring-primary/50")}
                >
                  <span className="grid size-9 place-items-center rounded-full text-lg" style={{ backgroundColor: `hsl(${parent.color} / 0.14)` }}>
                    {parent.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{parent.name}</span>
                    <span className="text-xs text-muted-foreground">{children.length} subcategories</span>
                  </span>
                  <Pencil className="size-4 shrink-0 text-muted-foreground" />
                </button>

                <div className="flex flex-wrap gap-2">
                  {children.map((child) => (
                    <button
                      key={child.id}
                      onClick={() => setSel({ kind: "edit", id: child.id })}
                      className={cn(
                        "pressable inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                        isEditingId(child.id) && "ring-1 ring-primary/50",
                      )}
                      style={{ color: `hsl(${child.color})`, backgroundColor: `hsl(${child.color} / 0.14)` }}
                    >
                      {child.icon} {child.name}
                    </button>
                  ))}
                  <button
                    onClick={() => setSel({ kind: "new", parentId: parent.id })}
                    className="pressable inline-flex items-center gap-1 rounded-full border border-dashed border-[hsl(var(--muted-foreground)/0.4)] px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="size-3" /> Add subcategory
                  </button>
                </div>
              </Card>
            );
          })}

          <button
            onClick={() => setSel({ kind: "new", parentId: null })}
            className="pressable flex w-full items-center justify-center gap-2 rounded-glass glass-inset p-4 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-4" /> New category
          </button>
        </div>

        {/* Desktop editor */}
        <Card className="hidden h-fit lg:sticky lg:top-6 lg:block">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={selKey}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={spring}
            >
              {sel ? editor : <EditorEmpty onNew={() => setSel({ kind: "new", parentId: null })} />}
            </motion.div>
          </AnimatePresence>
        </Card>
      </div>

      {/* Mobile sheet */}
      <Dialog open={!isDesktop && sel !== null} onOpenChange={(o) => !o && setSel(null)}>
        <DialogContent title={selectedCategory ? "Edit category" : "New category"}>{editor}</DialogContent>
      </Dialog>
    </>
  );
}

function EditorEmpty({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <Layers className="size-6 text-muted-foreground" />
      <p className="font-medium">Select an item</p>
      <p className="max-w-56 text-sm text-muted-foreground">Pick a category or subcategory on the left to rename or delete it.</p>
      <Button size="sm" variant="glass" onClick={onNew} className="gap-1.5">
        <Plus className="size-4" /> New category
      </Button>
    </div>
  );
}
