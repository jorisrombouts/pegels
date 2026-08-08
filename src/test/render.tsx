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

/**
 * Render a component that consumes useData(), with the seeded dataset available.
 *
 * The provider goes in via RTL's `wrapper` option rather than nesting it around `ui`, because
 * `rerender()` re-renders only what it is given — a nested provider would be dropped on rerender
 * and the component would throw "No QueryClient set". As a wrapper it survives.
 */
export function renderWithData(ui: ReactElement, opts: { dataset?: Dataset } = {}) {
  const queryClient = makeTestClient(opts.dataset);
  const result = render(ui, {
    wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  });
  return { ...result, queryClient };
}
