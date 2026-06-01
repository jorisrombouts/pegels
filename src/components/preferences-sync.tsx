"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useUI } from "@/store/ui";
import { loadPreferences, savePreferences } from "@/app/actions/preferences";
import { shouldSave, type UserPrefs } from "@/lib/preferences";

const SAVE_DEBOUNCE_MS = 800;

/**
 * Syncs the durable UI prefs (dashboard layout + bottom-nav config) with Neon.
 * Server is source of truth; the Zustand store + localStorage are the instant/offline cache.
 * Renders nothing. Mounted once inside the auth-gated (app) layout.
 */
export function PreferencesSync() {
  const layout = useUI((s) => s.layout);
  const navConfig = useUI((s) => s.navConfig);
  const lastSaved = useRef<UserPrefs | null>(null);
  const hydrated = useRef(false);

  // staleTime: Infinity is load-bearing — it stops a post-restore refetch from overwriting
  // the just-hydrated store and triggering a spurious resave.
  const { data } = useQuery({ queryKey: ["preferences"], queryFn: loadPreferences, staleTime: Infinity });
  const { mutate } = useMutation({
    mutationFn: savePreferences,
    onError: (e) => console.error("Failed to save UI preferences", e),
  });

  // Hydrate the store from the server row once, when the query resolves.
  useEffect(() => {
    if (hydrated.current || data === undefined) return; // still loading
    if (data) {
      useUI.setState({ layout: data.layout, navConfig: data.navConfig });
      lastSaved.current = { layout: data.layout, navConfig: data.navConfig };
    }
    // data === null → no row yet: leave lastSaved null so the first edit seeds the row.
    hydrated.current = true;
  }, [data]);

  // After hydration, debounce-save genuine changes.
  useEffect(() => {
    if (!hydrated.current) return;
    const next: UserPrefs = { layout, navConfig };
    if (!shouldSave(lastSaved.current, next)) return;
    const t = setTimeout(() => {
      // Stamp lastSaved only on success, so a failed write stays eligible to retry on the
      // next change instead of being silently suppressed by shouldSave.
      mutate(next, { onSuccess: () => { lastSaved.current = next; } });
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [layout, navConfig, mutate]);

  return null;
}
