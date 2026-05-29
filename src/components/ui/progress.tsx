import { cn } from "@/lib/utils";

/** Linear progress bar. `color` is any CSS color; track is a muted neutral. */
export function ProgressBar({
  pct,
  color = "hsl(var(--primary))",
  className,
  height = 8,
}: {
  pct: number; // 0..1+
  color?: string;
  className?: string;
  height?: number;
}) {
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <div
      className={cn("w-full overflow-hidden rounded-full bg-[hsl(var(--muted-foreground)/0.18)]", className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${clamped * 100}%`, backgroundColor: color }}
      />
    </div>
  );
}
