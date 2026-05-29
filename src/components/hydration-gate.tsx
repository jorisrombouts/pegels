"use client";

import { useMounted } from "@/lib/use-mounted";

/**
 * Renders children only after mount. The data + UI stores hydrate from
 * localStorage on the client, so gating avoids server/client mismatch on the
 * numbers and theme.
 */
export function HydrationGate({ children }: { children: React.ReactNode }) {
  const mounted = useMounted();

  if (!mounted) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="size-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
      </div>
    );
  }
  return <>{children}</>;
}
