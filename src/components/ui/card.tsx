import { cn } from "@/lib/utils";

/** Frosted glass surface — the core card of the app. */
export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "glass overflow-hidden rounded-glass p-5",
        className,
      )}
      {...props}
    />
  );
}

/** Uppercase, tracked section label used as a card header (e.g. "TOTAL SPENDING"). */
export function SectionLabel({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** Header row with a label on the left and an optional action ("All →") on the right. */
export function CardHeader({
  label,
  action,
  className,
}: {
  label: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-center justify-between gap-3", className)}>
      <SectionLabel>{label}</SectionLabel>
      {action}
    </div>
  );
}
