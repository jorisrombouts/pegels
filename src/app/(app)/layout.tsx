import { redirect } from "next/navigation";
import { HydrationBoundary } from "@tanstack/react-query";
import { auth } from "@/lib/auth";
import { requireUserId } from "@/lib/auth-helpers";
import { getDataset } from "@/lib/db/queries";
import { dehydrateDataset } from "@/lib/prefetch";
import { BottomNav } from "@/components/nav/bottom-nav";
import { LazyModals } from "@/components/lazy-modals";
import { HydrationGate } from "@/components/hydration-gate";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { PreferencesSync } from "@/components/preferences-sync";
import { MonthInitializer } from "@/components/month-initializer";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  // Prefetch the dataset server-side (reusing the session we just fetched — no second auth()
  // round-trip) and dehydrate it into the HTML, so a cache-cold first visit has the data the
  // moment it hydrates instead of making a follow-up server-action round-trip.
  const userId = requireUserId(session);
  const dehydratedState = await dehydrateDataset(() => getDataset(userId));

  return (
    <HydrationBoundary state={dehydratedState}>
      <HydrationGate>
        <ServiceWorkerRegister />
        <PreferencesSync />
        <MonthInitializer />
        <div className="mx-auto w-full max-w-6xl px-4 pb-36 pt-[max(1.5rem,calc(env(safe-area-inset-top)+0.75rem))] sm:px-6 sm:pt-[max(2.5rem,calc(env(safe-area-inset-top)+0.75rem))]">{children}</div>
        <LazyModals />
        <BottomNav />
      </HydrationGate>
    </HydrationBoundary>
  );
}
