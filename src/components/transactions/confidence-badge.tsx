import type { ConfidenceLevel } from "@/lib/ai/confidence";
import { cn } from "@/lib/utils";

/**
 * How much a categorization is worth trusting, in words.
 *
 * Deliberately not a percentage. The model's number is uncalibrated — on the hold-out its mean on
 * correct answers and on wrong ones are indistinguishable — so "58%" would claim a precision that
 * does not exist. These three say what is actually known.
 */
const COPY: Record<ConfidenceLevel | "user", { label: string; title: string; color: string }> = {
  user: {
    label: "Your choice",
    title: "You set this category yourself.",
    color: "hsl(var(--positive))",
  },
  confirmed: {
    label: "Confirmed",
    title: "Matches a merchant you've already approved.",
    color: "hsl(var(--positive))",
  },
  likely: {
    label: "Likely",
    title: "Based on similar merchants you've approved, but nothing identical.",
    color: "hsl(var(--warning))",
  },
  unsure: {
    label: "New merchant",
    title: "Nothing like this in your approved examples yet — worth a look.",
    color: "hsl(var(--negative))",
  },
};

export function ConfidenceBadge({
  level,
  isUserChoice,
  className,
}: {
  level: ConfidenceLevel | null;
  isUserChoice?: boolean;
  className?: string;
}) {
  const key = isUserChoice ? "user" : level;
  if (!key) return null;
  const { label, title, color } = COPY[key];
  return (
    <span title={title} className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

/** Just the dot, for dense rows where a word doesn't fit. */
export function ConfidenceDot({ level, isUserChoice }: { level: ConfidenceLevel | null; isUserChoice?: boolean }) {
  const key = isUserChoice ? "user" : level;
  if (!key) return null;
  const { title, color } = COPY[key];
  return (
    <span
      title={title}
      aria-label={COPY[key].label}
      className="size-1.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}
