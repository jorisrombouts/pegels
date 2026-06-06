import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { BottomNav } from "@/components/nav/bottom-nav";
import { QuickAddModal } from "@/components/nav/quick-add-modal";
import { ImportModal } from "@/components/import/import-modal";
import { HydrationGate } from "@/components/hydration-gate";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { PreferencesSync } from "@/components/preferences-sync";
import { MonthInitializer } from "@/components/month-initializer";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  return (
    <HydrationGate>
      <ServiceWorkerRegister />
      <PreferencesSync />
      <MonthInitializer />
      <div className="mx-auto w-full max-w-6xl px-4 pb-36 pt-[max(1.5rem,calc(env(safe-area-inset-top)+0.75rem))] sm:px-6 sm:pt-[max(2.5rem,calc(env(safe-area-inset-top)+0.75rem))]">{children}</div>
      <QuickAddModal />
      <ImportModal />
      <BottomNav />
    </HydrationGate>
  );
}
