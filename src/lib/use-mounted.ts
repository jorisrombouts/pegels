"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * True only after client hydration. Uses useSyncExternalStore (server snapshot
 * = false, client = true) so there's no setState-in-effect. Used to gate
 * client-only UI (persisted stores, theme) without a hydration mismatch.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
