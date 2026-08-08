"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/app/actions/corpus";
import type { CurationRow } from "@/lib/corpus/types";
import type { TransactionKind } from "@/lib/domain/types";

/**
 * The corpus lives in its own query, deliberately not in `['dataset']`.
 *
 * `getDataset` is on the critical path of every page load; folding a few thousand corpus rows into
 * it would tax the whole app for the benefit of one page. Same optimistic-with-rollback contract
 * as `useData`, so edits feel instant and a failed write resyncs rather than lying.
 */
export const CORPUS_KEY = ["corpus"] as const;

export type CorpusEdit = {
  finalCategoryId?: string | null;
  finalTagIds?: string[];
  finalKind?: TransactionKind;
};

export function useCorpus() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: CORPUS_KEY, queryFn: api.loadCorpusRows });
  const rows = useMemo(() => data ?? [], [data]);

  const actions = useMemo(() => {
    const run = (mutate: (rows: CurationRow[]) => CurationRow[], persist: () => Promise<unknown>) => {
      const prev = qc.getQueryData<CurationRow[]>(CORPUS_KEY) ?? [];
      qc.setQueryData(CORPUS_KEY, mutate(prev));
      void persist().catch(() => {
        qc.setQueryData(CORPUS_KEY, prev);
        void qc.invalidateQueries({ queryKey: CORPUS_KEY });
      });
    };
    const patchRow = (id: string, patch: Partial<CurationRow>) => (rs: CurationRow[]) =>
      rs.map((r) => (r.id === id ? { ...r, ...patch } : r));

    return {
      approve: (id: string, edit: CorpusEdit = {}) =>
        run(patchRow(id, { ...edit, status: "approved" }), () => api.approveExample(id, edit)),
      reject: (id: string) => run(patchRow(id, { status: "rejected" }), () => api.rejectExample(id)),
      restore: (id: string) => run(patchRow(id, { status: "candidate" }), () => api.setExampleStatus(id, "candidate")),
      edit: (id: string, patch: CorpusEdit) => run(patchRow(id, patch), () => api.editExample(id, patch)),
      remove: (id: string) => run((rs) => rs.filter((r) => r.id !== id), () => api.removeExample(id)),
      /** Not optimistic: the backfill's effect isn't knowable client-side, so refetch after. */
      backfill: async (includeHighConfidenceModel = false) => {
        const report = await api.backfillCorpus(includeHighConfidenceModel);
        await qc.invalidateQueries({ queryKey: CORPUS_KEY });
        return report;
      },
    };
  }, [qc]);

  return { rows, isLoading, ...actions };
}
