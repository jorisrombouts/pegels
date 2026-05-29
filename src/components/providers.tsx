"use client";

import { ThemeProvider } from "next-themes";
import { MotionConfig } from "motion/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getQueryClient, createPersister, PERSIST_MAX_AGE } from "@/lib/query";

export function Providers({ children }: { children: React.ReactNode }) {
  const client = getQueryClient();
  const persister = createPersister();

  const inner = (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      </MotionConfig>
    </ThemeProvider>
  );

  // Browser: persist the Query cache to localStorage (instant + offline reads).
  // Server render: no persister available, use the plain provider.
  return persister ? (
    <PersistQueryClientProvider client={client} persistOptions={{ persister, maxAge: PERSIST_MAX_AGE }}>
      {inner}
    </PersistQueryClientProvider>
  ) : (
    <QueryClientProvider client={client}>{inner}</QueryClientProvider>
  );
}
