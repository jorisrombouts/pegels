"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { renameStorageKey } from "@/lib/migrate-storage";
import { monthKey } from "@/lib/format";

// Carry over state from the pre-rebrand key (Saldo → Pegels) before hydration.
renameStorageKey("saldo-ui", "pegels-ui");

export type WidgetSize = "small" | "medium" | "large";
export interface WidgetLayout {
  id: string;
  size: WidgetSize;
}

// Curated for a focused first screen: hero + most useful widgets up top, supporting
// widgets below. All widgets stay present (reorder/resize via Edit layout).
export const defaultLayout: WidgetLayout[] = [
  { id: "total", size: "large" },
  { id: "breakdown", size: "large" },
  { id: "budgets", size: "medium" },
  { id: "goals", size: "medium" },
  { id: "trend", size: "large" },
  { id: "recent", size: "medium" },
  { id: "calendar", size: "medium" },
];

/** v3: rename the donut slot to breakdown, drop the removed byaccount/pace tiles, append new defaults. */
export function migrateLayoutToV3(layout: WidgetLayout[]): WidgetLayout[] {
  const moved = layout
    .map((w) => (w.id === "category" ? { ...w, id: "breakdown" } : w))
    .filter((w) => w.id !== "byaccount" && w.id !== "pace");
  const known = new Set(moved.map((w) => w.id));
  return [...moved, ...defaultLayout.filter((w) => !known.has(w.id))];
}

/** Max destinations allowed directly in the bottom pill (keeps it roomy). */
export const MAX_PRIMARY_NAV = 4;

export interface NavConfigItem {
  key: string; // matches NAV_REGISTRY keys
  primary: boolean; // true = shown as a tab in the bar; false = under "More"
}

export const defaultNavConfig: NavConfigItem[] = [
  { key: "home", primary: true },
  { key: "transactions", primary: true },
  { key: "budgets", primary: true },
  { key: "goals", primary: true },
  { key: "categories", primary: false },
  { key: "accounts", primary: false },
  { key: "tags", primary: false },
  { key: "rules", primary: false },
  { key: "settings", primary: false },
];

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

  /** User-arrangeable dashboard widgets (order + per-widget size). */
  layout: WidgetLayout[];
  reorderLayout: (orderedIds: string[]) => void;
  setWidgetSize: (id: string, size: WidgetSize) => void;
  resetLayout: () => void;

  /** Customizable bottom-nav: which destinations are tabs vs. under "More", and order. */
  navConfig: NavConfigItem[];
  setNavPrimary: (key: string, primary: boolean) => void;
  moveNavItem: (key: string, dir: -1 | 1) => void;
  resetNav: () => void;

  /** Transient: a data write failed and its optimistic change was rolled back (see run() in
   *  src/store/data.ts). Drives the dismissible SaveFailedBanner. */
  saveFailed: boolean;
  setSaveFailed: (failed: boolean) => void;

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

      layout: defaultLayout,
      reorderLayout: (orderedIds) =>
        set((s) => ({
          layout: orderedIds
            .map((id) => s.layout.find((w) => w.id === id))
            .filter((w): w is WidgetLayout => Boolean(w)),
        })),
      setWidgetSize: (id, size) =>
        set((s) => ({ layout: s.layout.map((w) => (w.id === id ? { ...w, size } : w)) })),
      resetLayout: () => set({ layout: defaultLayout }),

      navConfig: defaultNavConfig,
      setNavPrimary: (key, primary) =>
        set((s) => {
          // Enforce the max-primary cap when turning one on.
          if (primary && s.navConfig.filter((n) => n.primary).length >= MAX_PRIMARY_NAV) return s;
          return { navConfig: s.navConfig.map((n) => (n.key === key ? { ...n, primary } : n)) };
        }),
      moveNavItem: (key, dir) =>
        set((s) => {
          const i = s.navConfig.findIndex((n) => n.key === key);
          const j = i + dir;
          if (i === -1 || j < 0 || j >= s.navConfig.length) return s;
          const next = s.navConfig.slice();
          [next[i], next[j]] = [next[j], next[i]];
          return { navConfig: next };
        }),
      resetNav: () => set({ navConfig: defaultNavConfig }),

      saveFailed: false,
      setSaveFailed: (failed) => set({ saveFailed: failed }),

      importOpen: false,
      setImportOpen: (open) => set({ importOpen: open }),
      quickAddOpen: false,
      setQuickAddOpen: (open) => set({ quickAddOpen: open }),
    }),
    {
      name: "pegels-ui",
      version: 3,
      // Persist only durable preferences — transient flags (importOpen) stay out. `month` is NOT
      // persisted: MonthInitializer resets it to the latest data month on each load.
      partialize: (s) => ({ masked: s.masked, accountFilter: s.accountFilter, layout: s.layout, navConfig: s.navConfig }),
      // Ensure new widgets appear for users with a persisted older layout.
      migrate: (persisted) => {
        const state = persisted as Partial<UIState> | undefined;
        if (!state?.layout) return state as UIState;
        return { ...state, layout: migrateLayoutToV3(state.layout) } as UIState;
      },
    },
  ),
);
