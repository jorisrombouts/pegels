import { BottomNav } from "@/components/nav/bottom-nav";
import { QuickAddModal } from "@/components/nav/quick-add-modal";
import { ImportModal } from "@/components/import/import-modal";
import { HydrationGate } from "@/components/hydration-gate";
import { ServiceWorkerRegister } from "@/components/service-worker-register";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <HydrationGate>
      <ServiceWorkerRegister />
      <div className="mx-auto w-full max-w-6xl px-4 pb-36 pt-6 sm:px-6 sm:pt-10">{children}</div>
      <QuickAddModal />
      <ImportModal />
      <BottomNav />
    </HydrationGate>
  );
}
