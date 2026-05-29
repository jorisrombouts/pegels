import { cn } from "@/lib/utils";

const base =
  "w-full rounded-xl bg-[hsl(var(--muted)/0.5)] border border-[hsl(var(--glass-border))] px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function Input({ className, autoComplete = "off", ...props }: React.ComponentProps<"input">) {
  // Non-auth fields default to autoComplete off (avoids password-manager triggers); overridable.
  return <input autoComplete={autoComplete} className={cn(base, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(base, "min-h-20 resize-y", className)} {...props} />;
}

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
