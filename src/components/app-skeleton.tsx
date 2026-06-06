/**
 * Shared loading skeleton: a header row, a hero block, and a few list rows. Used by the route-level
 * loading.tsx (server) and the HydrationGate fallback (client) so cold load and navigation show the
 * same calm placeholder instead of a spinner flash + layout shift.
 */
export function AppSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden>
      {/* header row */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-40 rounded-xl bg-[hsl(var(--muted)/0.5)]" />
        <div className="h-8 w-24 rounded-full bg-[hsl(var(--muted)/0.4)]" />
      </div>
      {/* hero / summary block */}
      <div className="h-24 rounded-2xl bg-[hsl(var(--muted)/0.4)]" />
      {/* list rows */}
      <div className="space-y-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-[hsl(var(--muted)/0.3)]" />
        ))}
      </div>
    </div>
  );
}
