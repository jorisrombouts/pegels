"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Dataset } from "@/data/mock";
import * as api from "@/app/actions/data";
import * as M from "./dataset-mutations";
import type { Account, Budget, Category, CategorizationRule, Tag, Transaction } from "@/lib/domain/types";

export { DATASET_KEY } from "./dataset-key";
import { DATASET_KEY } from "./dataset-key";

/**
 * Same shape as the old Zustand store (6 arrays + 15 mutations), so consumers are
 * unchanged — but backed by TanStack Query over Neon. Reads come from the `['dataset']`
 * query (persisted to localStorage for offline); each mutation updates the cache
 * optimistically, then persists via a server action, rolling back + resyncing on failure.
 */
export function useData() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: DATASET_KEY, queryFn: api.loadDataset });
  const dataset = data ?? M.emptyDataset;

  const actions = useMemo(() => {
    const run = (mutate: (d: Dataset) => Dataset, persist: (next: Dataset) => Promise<void>) => {
      const prev = qc.getQueryData<Dataset>(DATASET_KEY) ?? M.emptyDataset;
      const next = mutate(prev);
      qc.setQueryData(DATASET_KEY, next);
      void persist(next).catch(() => {
        qc.setQueryData(DATASET_KEY, prev); // rollback the optimistic change
        void qc.invalidateQueries({ queryKey: DATASET_KEY }); // resync server truth
      });
    };

    return {
      updateTransaction: (id: string, patch: Partial<Transaction>) =>
        run(
          (d) => M.applyUpdateTransaction(d, id, patch),
          (next) => {
            const tx = next.transactions.find((t) => t.id === id);
            return tx ? api.upsertTransaction(tx) : Promise.resolve();
          },
        ),
      addTransaction: (tx: Transaction) => run((d) => M.applyAddTransaction(d, tx), () => api.upsertTransaction(tx)),
      addTransactions: (txs: Transaction[]) => run((d) => M.applyAddTransactions(d, txs), () => api.addTransactions(txs)),
      removeTransaction: (id: string) => run((d) => M.applyRemoveTransaction(d, id), () => api.removeTransaction(id)),

      upsertCategory: (c: Category) => run((d) => M.applyUpsertCategory(d, c), () => api.upsertCategory(c)),
      removeCategory: (id: string) => run((d) => M.applyRemoveCategory(d, id), () => api.removeCategory(id)),
      upsertTag: (t: Tag) => run((d) => M.applyUpsertTag(d, t), () => api.upsertTag(t)),
      removeTag: (id: string) => run((d) => M.applyRemoveTag(d, id), () => api.removeTag(id)),
      upsertAccount: (a: Account) => run((d) => M.applyUpsertAccount(d, a), () => api.upsertAccount(a)),
      removeAccount: (id: string) => run((d) => M.applyRemoveAccount(d, id), () => api.removeAccount(id)),
      upsertBudget: (b: Budget) => run((d) => M.applyUpsertBudget(d, b), () => api.upsertBudget(b)),
      removeBudget: (id: string) => run((d) => M.applyRemoveBudget(d, id), () => api.removeBudget(id)),
      upsertRule: (r: CategorizationRule) => run((d) => M.applyUpsertRule(d, r), () => api.upsertRule(r)),
      removeRule: (id: string) => run((d) => M.applyRemoveRule(d, id), () => api.removeRule(id)),
      reorderRules: (orderedIds: string[]) => run((d) => M.applyReorderRules(d, orderedIds), () => api.reorderRules(orderedIds)),

      clearData: () => run(() => M.emptyDataset, () => api.clearData()),
      // Lazy-load the sample dataset so it isn't in the main client bundle — this seldom-used
      // action is the only thing that needs it on the client.
      resetData: async () => {
        const { seedDataset } = await import("@/data/mock");
        run(() => seedDataset, () => api.resetData());
      },
    };
  }, [qc]);

  // Memoize the merged view so its identity is stable between actual data changes. Without this the
  // spread allocates a fresh object every render, defeating any consumer memo/effect keyed on `useData()`.
  return useMemo(() => ({ ...dataset, ...actions }), [dataset, actions]);
}
