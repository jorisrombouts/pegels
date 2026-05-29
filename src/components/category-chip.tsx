import { cn } from "@/lib/utils";
import type { Category } from "@/lib/domain/types";

/** Colored category pill (emoji + name), tinted from the category's own hue. */
export function CategoryChip({
  category,
  confidence,
  className,
}: {
  category: Category | undefined;
  /** 0..1 model confidence — renders a small dot when provided. */
  confidence?: number | null;
  className?: string;
}) {
  if (!category) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-muted-foreground glass-inset", className)}>
        Uncategorized
      </span>
    );
  }
  const color = `hsl(${category.color})`;
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", className)}
      style={{ color, backgroundColor: `hsl(${category.color} / 0.14)` }}
    >
      <span aria-hidden>{category.icon}</span>
      {category.name}
      {confidence != null && (
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: confidence >= 0.85 ? "hsl(var(--positive))" : confidence >= 0.6 ? "hsl(var(--warning))" : "hsl(var(--negative))" }}
          title={`${Math.round(confidence * 100)}% confidence`}
        />
      )}
    </span>
  );
}
