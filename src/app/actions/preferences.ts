"use server";

import { getUserId } from "@/lib/auth";
import { getPreferences, upsertPreferences } from "@/lib/db/queries";
import type { UserPrefs } from "@/lib/preferences";

export async function loadPreferences(): Promise<UserPrefs | null> {
  return getPreferences(await getUserId());
}

export async function savePreferences(prefs: UserPrefs): Promise<void> {
  await upsertPreferences(await getUserId(), prefs);
}
