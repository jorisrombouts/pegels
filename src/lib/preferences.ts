import type { WidgetLayout, NavConfigItem } from "@/store/ui";

export interface UserPrefs {
  layout: WidgetLayout[];
  navConfig: NavConfigItem[];
}

/** True when `next` differs from `prev` (or there is no prev). Backs save-suppression. */
export function shouldSave(prev: UserPrefs | null, next: UserPrefs): boolean {
  if (!prev) return true;
  return JSON.stringify(prev) !== JSON.stringify(next);
}
