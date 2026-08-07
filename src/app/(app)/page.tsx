"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { DashboardControls } from "@/components/dashboard/controls";
import { DASHBOARD_LAYOUT, colSpan, widgets, type DashCtx } from "@/components/dashboard/registry";
import { computeDashboard } from "@/components/dashboard/compute";
import { buildMaps, categoryTrends, dailySpend } from "@/lib/domain/selectors";
import { useShallow } from "zustand/react/shallow";
import { useData } from "@/store/data";
import { useUI } from "@/store/ui";
import { monthLabel } from "@/lib/format";

export default function DashboardPage() {
  const data = useData();
  const router = useRouter();
  // Scoped pick so opening modals (importOpen/quickAddOpen) doesn't recompute the dashboard.
  const { month, accountFilter, masked } = useUI(
    useShallow((s) => ({ month: s.month, accountFilter: s.accountFilter, masked: s.masked })),
  );

  // The dataset slices are referentially stable across renders (TanStack Query structural sharing),
  // so memoizing on them skips these full-transaction scans on every unrelated re-render (modal
  // toggles elsewhere in the tree).
  const { transactions, categories } = data;
  const maps = useMemo(() => buildMaps(categories), [categories]);
  const d = useMemo(
    () => computeDashboard(data, month, accountFilter),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `data` is a fresh wrapper each render; key on the slices computeDashboard actually reads.
    [transactions, categories, data.budgets, data.tags, data.accounts, month, accountFilter],
  );
  const recent = useMemo(
    () => [...transactions].filter((t) => t.kind !== "income").sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    [transactions],
  );
  const trend = useMemo(() => categoryTrends(transactions, maps, categories, month, 6), [transactions, maps, categories, month]);
  const daily = useMemo(() => dailySpend(transactions, maps, month), [transactions, maps, month]);

  // Deep-link helper: widgets navigate to filtered pages.
  const onNavigate = useCallback((href: string) => router.push(href), [router]);

  const ctx: DashCtx = {
    d,
    masked,
    month,
    categoryById: maps.categoryById,
    recent,
    trend,
    daily,
    onNavigate,
  };

  return (
    <>
      <PageHeader title="Dashboard" subtitle={monthLabel(month)} controls={<DashboardControls />} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {DASHBOARD_LAYOUT.map(({ id, size }) => {
          const render = widgets[id];
          if (!render) return null;
          return (
            <div key={id} className={colSpan(size)}>
              {render(ctx, size)}
            </div>
          );
        })}
      </div>
    </>
  );
}
