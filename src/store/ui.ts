"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { renameStorageKey } from "@/lib/migrate-storage";
import { monthKey } from "@/lib/format";

// Carry over state from the pre-rebrand key (Saldo → Pegels) before hydration.
renameStorageKey("saldo-ui", "pegels-ui");

interface UIState {
  /** Privacy mask — hides every amount as "•••• kr" (PRD §3.5). */
  masked: boolean;
  toggleMask: () => void;
  /** Selected month, "yyyy-mm". Defaults to the current month; MonthInitializer jumps to the
   *  latest month that has data once it loads. The loading/empty state therefore shows the
   *  current month, never a stale hardcoded one. */
  month: string;
  setMonth: (m: string) => void;
  /** Selected account filter on the dashboard ("all" or an account id). */
  accountFilter: string;
  setAccountFilter: (id: string) => void;

  /** Transient: whether the Import modal is open (not persisted). */
  importOpen: boolean;
  setImportOpen: (open: boolean) => void;
  /** Transient: whether the Quick Add modal is open (not persisted). */
  quickAddOpen: boolean;
  setQuickAddOpen: (open: boolean) => void;
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      masked: false,
      toggleMask: () => set((s) => ({ masked: !s.masked })),
      month: monthKey(new Date()),
      setMonth: (m) => set({ month: m }),
      accountFilter: "all",
      setAccountFilter: (id) => set({ accountFilter: id }),

      importOpen: false,
      setImportOpen: (open) => set({ importOpen: open }),
      quickAddOpen: false,
      setQuickAddOpen: (open) => set({ quickAddOpen: open }),
    }),
    {
      name: "pegels-ui",
      version: 4,
      // Persist only durable preferences — transient flags (importOpen) stay out. `month` is NOT
      // persisted: MonthInitializer resets it to the latest data month on each load.
      partialize: (s) => ({ masked: s.masked, accountFilter: s.accountFilter }),
      // v4: the dashboard layout and bottom-nav are no longer user-arrangeable. Drop the stale
      // `layout`/`navConfig` keys rather than letting them merge back in as dead state.
      migrate: (persisted) => {
        const s = persisted as Partial<UIState> | undefined;
        return { masked: s?.masked ?? false, accountFilter: s?.accountFilter ?? "all" } as UIState;
      },
    },
  ),
);
