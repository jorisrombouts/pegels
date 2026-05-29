import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { seedDataset, type Dataset } from "@/data/mock";
import { DATASET_KEY } from "@/store/data";

/** A QueryClient with the dataset pre-seeded and refetching disabled (for tests). */
export function makeTestClient(dataset: Dataset = seedDataset): QueryClient {
  const qc = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity, retry: false } },
  });
  qc.setQueryData(DATASET_KEY, dataset);
  return qc;
}

/** Render a component that consumes useData(), with the seeded dataset available. */
export function renderWithData(ui: ReactElement, opts: { dataset?: Dataset } = {}) {
  const queryClient = makeTestClient(opts.dataset);
  const result = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return { ...result, queryClient };
}
