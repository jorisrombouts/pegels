/**
 * One-time rename of a localStorage key (e.g. after the Saldo → Pegels rebrand).
 * Copies old → new if the new key isn't set yet, then removes the old one.
 * Runs client-side only; must be called before the persisted store hydrates.
 */
export function renameStorageKey(oldKey: string, newKey: string) {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(newKey) === null) {
      const old = localStorage.getItem(oldKey);
      if (old !== null) localStorage.setItem(newKey, old);
    }
    localStorage.removeItem(oldKey);
  } catch {
    /* storage unavailable (private mode, etc.) — ignore */
  }
}
