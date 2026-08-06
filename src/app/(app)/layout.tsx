import { Suspense } from "react";
import { redirect } from "next/navigation";
import { HydrationBoundary } from "@tanstack/react-query";
import { auth } from "@/lib/auth";
import { requireUserId } from "@/lib/auth-helpers";
import { getDataset } from "@/lib/db/queries";
import { dehydrateDataset } from "@/lib/prefetch";
import { AppSkeleton } from "@/components/app-skeleton";
import { BottomNav } from "@/components/nav/bottom-nav";
import { LazyModals } from "@/components/lazy-modals";
import { HydrationGate } from "@/components/hydration-gate";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { PreferencesSync } from "@/components/preferences-sync";
import { SaveFailedBanner } from "@/components/save-failed-banner";
import { MonthInitializer } from "@/components/month-initializer";
import { MotionProvider } from "@/components/motion-provider";

// The page container. Shared with the Suspense fallback below so the streamed-in content lands in
// the same box the skeleton occupied — same string the gate's own fallback uses.
const SHELL = "mx-auto w-full max-w-6xl px-4 pb-36 pt-[max(1.5rem,calc(env(safe-area-inset-top)+0.75rem))] sm:px-6 sm:pt-[max(2.5rem,calc(env(safe-area-inset-top)+0.75rem))]";

/**
 * Prefetch the dataset server-side (reusing the session the layout already fetched — no second
 * auth() round-trip) and dehydrate it into the HTML, so a cache-cold first visit has the data the
 * moment it hydrates instead of making a follow-up server-action round-trip.
 *
 * Split out of the layout so the await sits *below* a <Suspense> boundary: loading.tsx does not
 * wrap the layout in its own segment, so without this the whole document would block on the query.
 */
async function DatasetBoundary({ userId, children }: { userId: string; children: React.ReactNode }) {
  const dehydratedState = await dehydrateDataset(() => getDataset(userId));
  return <HydrationBoundary state={dehydratedState}>{children}</HydrationBoundary>;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Stays above the boundary: a redirect() after streaming starts degrades to a client-side one.
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const userId = requireUserId(session);

  return (
    <Suspense fallback={<div className={SHELL}><AppSkeleton /></div>}>
      <DatasetBoundary userId={userId}>
        <MotionProvider>
          <HydrationGate>
            <ServiceWorkerRegister />
            <PreferencesSync />
            <SaveFailedBanner />
            <MonthInitializer />
            <div className={SHELL}>{children}</div>
            <LazyModals />
            <BottomNav />
          </HydrationGate>
        </MotionProvider>
      </DatasetBoundary>
    </Suspense>
  );
}
