import { QueryClient, dehydrate, type DehydratedState } from "@tanstack/react-query";
import { DATASET_KEY } from "@/store/dataset-key";
import type { Dataset } from "@/data/mock";

/**
 * Prefetch the dataset on the server and return a dehydrated cache to embed via
 * <HydrationBoundary>, so a cache-cold first visit has the data the moment the client
 * hydrates — no extra round-trip. A failed load dehydrates to an empty cache (prefetchQuery
 * never throws), so the client simply fetches as before.
 */
export async function dehydrateDataset(load: () => Promise<Dataset>): Promise<DehydratedState> {
  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({ queryKey: DATASET_KEY, queryFn: load });
  return dehydrate(queryClient);
}
