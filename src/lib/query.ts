import { QueryClient, defaultShouldDehydrateQuery, type Query } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

const DAY = 1000 * 60 * 60 * 24;

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: DAY, // keep cached long enough to persist for offline reads
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

// One client in the browser (stable across renders); a throwaway client on the server.
let browserClient: QueryClient | undefined;
export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return makeQueryClient();
  if (!browserClient) browserClient = makeQueryClient();
  return browserClient;
}

// localStorage persister so the dataset is available instantly + offline (reads only).
export function createPersister() {
  if (typeof window === "undefined") return undefined;
  return createSyncStoragePersister({ storage: window.localStorage, key: "pegels-query" });
}

export const PERSIST_MAX_AGE = DAY;

// Bump to discard a previously persisted cache (e.g. when changing what gets persisted below).
export const PERSIST_BUSTER = "2026-06-10-prefs";

/**
 * Persist the dataset (for instant + offline reads) but NEVER the `['preferences']` query: prefs
 * are read fresh from the server each session (server is source of truth). A persisted,
 * infinitely-stale copy would be restored on reload and clobber the user's saved dashboard layout
 * and bottom-nav config — making preferences effectively write-only.
 */
export function shouldDehydrateQuery(query: Query): boolean {
  return query.queryKey[0] !== "preferences" && defaultShouldDehydrateQuery(query);
}
