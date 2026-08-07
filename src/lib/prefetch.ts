import { QueryClient, dehydrate, type DehydratedState } from "@tanstack/react-query";
import { DATASET_KEY } from "@/store/dataset-key";
import type { Dataset } from "@/data/mock";

/**
 * Prefetch the dataset on the server and return a dehydrated cache to embed via
 * <HydrationBoundary>, so a cache-cold first visit has the data the moment the client
 * hydrates — no extra round-trip.
 *
 * A failed load **throws**. It used to swallow the error and dehydrate an empty cache, which
 * rendered a working-looking but completely empty app: that is how a `getDataset` broken against
 * the live schema survived in production behind green builds and green deploys. A read that
 * cannot be served is a fault, not an empty result, so let it surface.
 *
 * `fetchQuery` rejects where `prefetchQuery` resolves; no retry option is needed because
 * query-core already defaults `retry` to 0 on the server (`retryer.js`: `config.retry ??
 * (isServer() ? 0 : 3)`), so this fails on the first attempt instead of adding backoff to TTFB.
 */
export async function dehydrateDataset(load: () => Promise<Dataset>): Promise<DehydratedState> {
  const queryClient = new QueryClient();
  await queryClient.fetchQuery({ queryKey: DATASET_KEY, queryFn: load });
  return dehydrate(queryClient);
}
