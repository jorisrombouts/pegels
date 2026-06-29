"use client";

import dynamic from "next/dynamic";
import { useUI } from "@/store/ui";

// The Import and Quick-Add modals are heavy (CSV/FX/AI client code) and rarely open, so split
// them out of the main bundle and only mount — and therefore only fetch their chunk — once the
// user actually opens one. The Dialog has no exit animation, so conditional mounting is seamless.
const ImportModal = dynamic(() => import("@/components/import/import-modal").then((m) => m.ImportModal));
const QuickAddModal = dynamic(() => import("@/components/nav/quick-add-modal").then((m) => m.QuickAddModal));

export function LazyModals() {
  const importOpen = useUI((s) => s.importOpen);
  const quickAddOpen = useUI((s) => s.quickAddOpen);
  return (
    <>
      {importOpen && <ImportModal />}
      {quickAddOpen && <QuickAddModal />}
    </>
  );
}
