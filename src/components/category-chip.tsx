import { cn } from "@/lib/utils";
import type { Category } from "@/lib/domain/types";
import type { ConfidenceLevel } from "@/lib/ai/confidence";
import { ConfidenceDot } from "@/components/transactions/confidence-badge";

/** Colored category pill (emoji + name), tinted from the category's own hue. */
export function CategoryChip({
  category,
  level,
  className,
}: {
  category: Category | undefined;
  /** Renders a small dot when provided. Named levels, not a percentage — see ConfidenceBadge. */
  level?: ConfidenceLevel | null;
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
      <ConfidenceDot level={level ?? null} />
    </span>
  );
}
