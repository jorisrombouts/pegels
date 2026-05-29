"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { spring, STAGGER_STEP } from "@/lib/motion";
import type { WidgetSize } from "@/store/ui";

const SIZES: WidgetSize[] = ["small", "medium", "large"];
const SIZE_LETTER: Record<WidgetSize, string> = { small: "S", medium: "M", large: "L" };

// Floor height per size so same-size widgets line up across rows.
const SIZE_MIN_H: Record<WidgetSize, string> = {
  small: "min-h-[208px]",
  medium: "min-h-[268px]",
  large: "min-h-[268px]",
};

/** Wraps a dashboard widget: draggable + size control while editing. */
export function SortableWidget({
  id,
  size,
  editing,
  onSize,
  index = 0,
  className,
  children,
}: {
  id: string;
  size: WidgetSize;
  editing: boolean;
  onSize: (size: WidgetSize) => void;
  index?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !editing });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  } as React.CSSProperties;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`widget-${id}`}
      data-size={size}
      className={cn("relative h-full", SIZE_MIN_H[size], className, isDragging && "z-20 opacity-80")}
    >
      {editing && (
        <div className="absolute -top-2 right-3 z-10 flex items-center gap-1 rounded-full glass px-1.5 py-1 shadow-lg">
          <div className="flex overflow-hidden rounded-full">
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                aria-label={`Size ${s}`}
                aria-pressed={size === s}
                onClick={() => onSize(s)}
                className={cn(
                  "size-6 text-[11px] font-semibold transition-colors",
                  size === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {SIZE_LETTER[s]}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="Drag to reorder"
            className="grid size-6 cursor-grab touch-none place-items-center text-muted-foreground active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        </div>
      )}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: Math.min(index, 9) * STAGGER_STEP }}
        className={cn("h-full", editing && "pointer-events-none select-none rounded-glass ring-2 ring-primary/40")}
      >
        {children}
      </motion.div>
    </div>
  );
}
