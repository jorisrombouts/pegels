"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Check, Pencil, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { DashboardControls } from "@/components/dashboard/controls";
import { SortableWidget } from "@/components/dashboard/sortable-widget";
import { colSpan, widgets, type DashCtx } from "@/components/dashboard/registry";
import { computeDashboard } from "@/components/dashboard/compute";
import { buildMaps, categoryTrends, dailySpend } from "@/lib/domain/selectors";
import { useShallow } from "zustand/react/shallow";
import { useData } from "@/store/data";
import { useUI } from "@/store/ui";
import { monthLabel } from "@/lib/format";

export default function DashboardPage() {
  const data = useData();
  const router = useRouter();
  // Scoped pick so opening modals (importOpen/quickAddOpen) doesn't recompute the dashboard.
  const { month, accountFilter, masked, layout, reorderLayout, setWidgetSize, resetLayout } = useUI(
    useShallow((s) => ({
      month: s.month,
      accountFilter: s.accountFilter,
      masked: s.masked,
      layout: s.layout,
      reorderLayout: s.reorderLayout,
      setWidgetSize: s.setWidgetSize,
      resetLayout: s.resetLayout,
    })),
  );
  const [editing, setEditing] = useState(false);

  const maps = buildMaps(data.categories);
  const ctx: DashCtx = {
    d: computeDashboard(data, month, accountFilter),
    masked,
    month,
    categoryById: maps.categoryById,
    recent: [...data.transactions].filter((t) => t.kind !== "income").sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    trend: categoryTrends(data.transactions, maps, data.categories, month, 6),
    daily: dailySpend(data.transactions, maps, month),
    // Deep-link helper: widgets navigate to filtered pages. Disabled while editing layout.
    onNavigate: editing ? () => {} : (href: string) => router.push(href),
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = layout.map((w) => w.id);
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    reorderLayout(next);
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={monthLabel(month)}
        controls={
          <div className="flex flex-wrap items-center gap-2">
            <DashboardControls />
            {editing && (
              <Button variant="glass" size="sm" onClick={resetLayout} className="gap-1.5">
                <RotateCcw className="size-4" /> Reset
              </Button>
            )}
            <Button variant={editing ? "primary" : "glass"} size="sm" onClick={() => setEditing((v) => !v)} className="gap-1.5">
              {editing ? <Check className="size-4" /> : <Pencil className="size-4" />}
              {editing ? "Done" : "Edit layout"}
            </Button>
          </div>
        }
      />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={layout.map((w) => w.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {layout.map((w, i) => {
              const render = widgets[w.id];
              if (!render) return null;
              return (
                <SortableWidget
                  key={w.id}
                  id={w.id}
                  size={w.size}
                  editing={editing}
                  onSize={(size) => setWidgetSize(w.id, size)}
                  index={i}
                  className={colSpan(w.size)}
                >
                  {render(ctx, w.size)}
                </SortableWidget>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </>
  );
}
