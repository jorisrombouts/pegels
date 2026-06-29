/**
 * The TanStack Query key for the whole dataset. Lives in its own module (no "use client")
 * so the server layout can prefetch under the exact same key the client `useData()` reads.
 */
export const DATASET_KEY = ["dataset"] as const;
