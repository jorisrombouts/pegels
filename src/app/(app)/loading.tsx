/**
 * Instant skeleton shown during navigation to any (app) route, so the first visit to a page
 * (which streams a dynamic server render) gives immediate feedback instead of feeling like a hang.
 * Rendered inside the layout's container, so no outer padding here.
 */
export default function Loading() {
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
