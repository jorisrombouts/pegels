"use client";

import { useMounted } from "@/lib/use-mounted";
import { AppSkeleton } from "@/components/app-skeleton";

/**
 * Renders children only after mount. The data + UI stores hydrate from
 * localStorage on the client, so gating avoids server/client mismatch on the
 * numbers and theme. The fallback mirrors the route skeleton (same container) so
 * the hydrate window looks continuous instead of flashing a spinner.
 */
export function HydrationGate({ children }: { children: React.ReactNode }) {
  const mounted = useMounted();

  if (!mounted) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 pb-36 pt-6 sm:px-6 sm:pt-10">
        <AppSkeleton />
      </div>
    );
  }
  return <>{children}</>;
}
