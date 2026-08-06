"use client";

import { X } from "lucide-react";
import { useUI } from "@/store/ui";

/**
 * Tells the user when a write failed and its optimistic change was rolled back (see run() in
 * src/store/data.ts) — otherwise the edit just silently un-applies. Mounted once in the (app) layout.
 */
export function SaveFailedBanner() {
  const saveFailed = useUI((s) => s.saveFailed);
  const setSaveFailed = useUI((s) => s.setSaveFailed);
  if (!saveFailed) return null;
  return (
    <div
      role="alert"
      className="glass fixed inset-x-4 top-4 z-[60] mx-auto flex max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm"
      style={{ color: "hsl(var(--negative))" }}
    >
      <span className="flex-1">Couldn&apos;t save your change — check your connection and try again.</span>
      <button type="button" onClick={() => setSaveFailed(false)} aria-label="Dismiss" className="pressable shrink-0">
        <X className="size-4" />
      </button>
    </div>
  );
}
