# Per-User UI Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync the dashboard `layout` and bottom-`navConfig` per user to Neon (keyed by `getUserId()`) so they follow the user across devices, while leaving the `useUI` store and every widget untouched.

**Architecture:** A new `user_preferences` table (one JSONB row per user) is read/written by server actions scoped to `getUserId()`. A single new `<PreferencesSync />` client component, mounted in the auth-gated `(app)` layout, hydrates the existing Zustand store from the server on load and debounce-saves `layout`/`navConfig` changes back. Neon is source of truth; `localStorage` remains the instant/offline cache. Last-write-wins.

**Tech Stack:** Next.js 16.2.6 (App Router, server actions), React 19, Zustand (persist), `@tanstack/react-query`, Drizzle ORM over `drizzle-orm/neon-http`, Neon Postgres, Vitest + Testing Library.

**Conventions reused:**
- Pure helpers + query mappers unit-tested with Vitest (see `src/lib/db/claim.test.ts`).
- Upsert idiom: `db.insert(table).values(row).onConflictDoUpdate({ target, set })` (see `src/lib/db/queries.ts:41`).
- Explicit `tsx` `CREATE TABLE IF NOT EXISTS` migration, run with `npx tsx`, then DELETED — NOT `drizzle-kit push`.
- Server actions scoped by `getUserId()` in `src/app/actions/` (see `src/app/actions/data.ts`).
- The migration touches the live Neon DB → run with `NODE_OPTIONS=--use-system-ca` (corporate-TLS fix on VPN) and `--env-file=.env.local`.
- Verify with `npx vitest run`, `npm run lint`, `npm run build`. **zsh has no `PIPESTATUS`** — check exit codes WITHOUT pipes: `cmd > /tmp/x.log 2>&1; echo "EXIT=$?"`.
- Types `WidgetLayout`, `NavConfigItem` are exported from `src/store/ui.ts`. Import them as **`import type`** (the store is `"use client"` with import-time side effects; a type-only import is erased and never bundles the client module server-side).

---

## File Structure

**Created:**
- `src/lib/preferences.ts` — shared `UserPrefs` type + pure `shouldSave(prev, next)`. Tested.
- `src/lib/preferences.test.ts` — `shouldSave` tests.
- `src/app/actions/preferences.ts` — `loadPreferences` / `savePreferences` server actions.
- `src/components/preferences-sync.tsx` — the `<PreferencesSync />` sync component.
- `src/components/preferences-sync.test.tsx` — component behavior tests.
- `scripts/migrate-user-preferences.ts` — one-off Neon migration (deleted after running).

**Modified:**
- `src/lib/db/schema.ts` — add the `userPreferences` table.
- `src/lib/db/queries.ts` — add `getPreferences` / `upsertPreferences`.
- `src/lib/db/queries.preferences.test.ts` — new test file for the two queries (mocked db).
- `src/app/(app)/layout.tsx` — mount `<PreferencesSync />`.

---

## Task 1: `user_preferences` table + Neon migration

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `scripts/migrate-user-preferences.ts` (deleted in Step 4)

- [ ] **Step 1: Add the table to the schema**

In `src/lib/db/schema.ts`, add this import near the top (after the existing `import type { … } from "../domain/types";` line):
```ts
import type { WidgetLayout, NavConfigItem } from "../../store/ui";
```
Then append at the END of the file:
```ts
// --- Per-user UI preferences (dashboard layout + bottom-nav config). One row per user. ---
export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id").primaryKey(),
  layout: jsonb("layout").$type<WidgetLayout[]>().notNull(),
  navConfig: jsonb("nav_config").$type<NavConfigItem[]>().notNull(),
  updatedAt: text("updated_at").notNull(),
});
```
(`pgTable`, `text`, `jsonb` are already imported in this file.)

- [ ] **Step 2: Write the migration script**

Create `scripts/migrate-user-preferences.ts`:
```ts
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  await sql`CREATE TABLE IF NOT EXISTS user_preferences (
    user_id text PRIMARY KEY,
    layout jsonb NOT NULL,
    nav_config jsonb NOT NULL,
    updated_at text NOT NULL
  )`;
  console.log("user_preferences created");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Run the migration against Neon**

Run:
```bash
NODE_OPTIONS=--use-system-ca npx tsx --env-file=.env.local scripts/migrate-user-preferences.ts > /tmp/migrate.log 2>&1; echo "EXIT=$?"
```
Expected: `EXIT=0` and `user_preferences created` in `/tmp/migrate.log`. Re-running is safe (`IF NOT EXISTS`).

- [ ] **Step 4: Delete the script + verify build**

```bash
rm scripts/migrate-user-preferences.ts
npm run build > /tmp/build.log 2>&1; echo "EXIT=$?"
```
Expected: `EXIT=0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(prefs): add user_preferences table"
```
End the commit body with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Task 2: `getPreferences` / `upsertPreferences` queries

**Files:**
- Modify: `src/lib/db/queries.ts`
- Test: `src/lib/db/queries.preferences.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/db/queries.preferences.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const selectWhere = vi.fn();
const onConflictDoUpdate = vi.fn(async () => {});
const values = vi.fn(() => ({ onConflictDoUpdate }));
const insert = vi.fn(() => ({ values }));

vi.mock("./index", () => ({
  db: {
    select: () => ({ from: () => ({ where: selectWhere }) }),
    insert: (...a: unknown[]) => insert(...a),
  },
}));

import { getPreferences, upsertPreferences } from "./queries";

const PREFS = { layout: [{ id: "total", size: "large" as const }], navConfig: [{ key: "home", primary: true }] };

describe("getPreferences", () => {
  beforeEach(() => selectWhere.mockReset());

  it("returns the row's layout + navConfig when a row exists", async () => {
    selectWhere.mockResolvedValue([{ userId: "u1", ...PREFS, updatedAt: "2026-06-01T00:00:00.000Z" }]);
    await expect(getPreferences("u1")).resolves.toEqual(PREFS);
  });

  it("returns null when no row exists", async () => {
    selectWhere.mockResolvedValue([]);
    await expect(getPreferences("u1")).resolves.toBeNull();
  });
});

describe("upsertPreferences", () => {
  beforeEach(() => { insert.mockClear(); values.mockClear(); onConflictDoUpdate.mockClear(); });

  it("upserts the row keyed by userId with an updatedAt stamp", async () => {
    await upsertPreferences("u1", PREFS);
    expect(insert).toHaveBeenCalledTimes(1);
    const row = values.mock.calls[0][0] as Record<string, unknown>;
    expect(row).toMatchObject({ userId: "u1", layout: PREFS.layout, navConfig: PREFS.navConfig });
    expect(typeof row.updatedAt).toBe("string");
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/db/queries.preferences.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"`
Expected: non-zero — `getPreferences`/`upsertPreferences` not exported.

- [ ] **Step 3: Implement the queries**

In `src/lib/db/queries.ts`:
- Add `userPreferences` to the existing schema import (the line beginning `import { accounts, categories, … } from "./schema";`).
- Add a type-only import near the top:
```ts
import type { WidgetLayout, NavConfigItem } from "../../store/ui";
```
- Append these two functions at the END of the file:
```ts
export async function getPreferences(
  userId: string,
): Promise<{ layout: WidgetLayout[]; navConfig: NavConfigItem[] } | null> {
  const rows = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId));
  const r = rows[0];
  return r ? { layout: r.layout, navConfig: r.navConfig } : null;
}

export async function upsertPreferences(
  userId: string,
  prefs: { layout: WidgetLayout[]; navConfig: NavConfigItem[] },
): Promise<void> {
  const row = {
    userId,
    layout: prefs.layout,
    navConfig: prefs.navConfig,
    updatedAt: new Date().toISOString(),
  };
  await db
    .insert(userPreferences)
    .values(row)
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { layout: row.layout, navConfig: row.navConfig, updatedAt: row.updatedAt },
    });
}
```
(`eq` is already imported at the top of `queries.ts`.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/db/queries.preferences.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"`
Expected: `EXIT=0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/queries.ts src/lib/db/queries.preferences.test.ts
git commit -m "feat(prefs): get/upsert user preferences queries"
```
End the commit body with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Task 3: `shouldSave` helper + server actions

**Files:**
- Create: `src/lib/preferences.ts`
- Test: `src/lib/preferences.test.ts`
- Create: `src/app/actions/preferences.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/preferences.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { shouldSave, type UserPrefs } from "./preferences";

const base: UserPrefs = {
  layout: [{ id: "total", size: "large" }],
  navConfig: [{ key: "home", primary: true }],
};

describe("shouldSave", () => {
  it("saves when there is no previous value", () => {
    expect(shouldSave(null, base)).toBe(true);
  });
  it("does not save an identical value", () => {
    expect(shouldSave({ ...base }, { ...base })).toBe(false);
  });
  it("saves when the layout changed", () => {
    const next: UserPrefs = { ...base, layout: [{ id: "total", size: "medium" }] };
    expect(shouldSave(base, next)).toBe(true);
  });
  it("saves when the nav config changed", () => {
    const next: UserPrefs = { ...base, navConfig: [{ key: "home", primary: false }] };
    expect(shouldSave(base, next)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/preferences.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"`
Expected: non-zero — module not found.

- [ ] **Step 3: Implement the helper**

Create `src/lib/preferences.ts`:
```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/preferences.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"`
Expected: `EXIT=0`.

- [ ] **Step 5: Add the server actions**

Create `src/app/actions/preferences.ts`:
```ts
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
```

- [ ] **Step 6: Verify lint + build + full suite**

```bash
npm run lint > /tmp/lint.log 2>&1; echo "LINT=$?"
npm run build > /tmp/build.log 2>&1; echo "BUILD=$?"
npx vitest run > /tmp/vitest.log 2>&1; echo "TEST=$?"
```
Expected: all `0`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/preferences.ts src/lib/preferences.test.ts src/app/actions/preferences.ts
git commit -m "feat(prefs): shouldSave helper + load/save server actions"
```
End the commit body with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Task 4: `<PreferencesSync />` component + mount

**Files:**
- Create: `src/components/preferences-sync.tsx`
- Test: `src/components/preferences-sync.test.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/preferences-sync.test.tsx`:
```tsx
import { act, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreferencesSync } from "./preferences-sync";
import { useUI, defaultLayout, defaultNavConfig } from "@/store/ui";
import { loadPreferences, savePreferences } from "@/app/actions/preferences";

vi.mock("@/app/actions/preferences", () => ({
  loadPreferences: vi.fn(),
  savePreferences: vi.fn(async () => {}),
}));

const SERVER = {
  layout: [{ id: "trend", size: "small" as const }],
  navConfig: [{ key: "home", primary: false }],
};

function renderSync() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PreferencesSync />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  act(() => useUI.setState({ layout: defaultLayout, navConfig: defaultNavConfig }));
});
afterEach(() => vi.useRealTimers());

describe("PreferencesSync", () => {
  it("hydrates the store from a server row", async () => {
    vi.mocked(loadPreferences).mockResolvedValue(SERVER);
    renderSync();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(useUI.getState().layout).toEqual(SERVER.layout);
    expect(useUI.getState().navConfig).toEqual(SERVER.navConfig);
  });

  it("does NOT save the just-hydrated value", async () => {
    vi.mocked(loadPreferences).mockResolvedValue(SERVER);
    renderSync();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(savePreferences).not.toHaveBeenCalled();
  });

  it("debounce-saves a later change", async () => {
    vi.mocked(loadPreferences).mockResolvedValue(SERVER);
    renderSync();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    act(() => useUI.getState().setWidgetSize("trend", "large"));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(savePreferences).toHaveBeenCalledTimes(1);
    expect(vi.mocked(savePreferences).mock.calls[0][0].layout).toEqual([{ id: "trend", size: "large" }]);
  });

  it("seeds on first change when there is no server row", async () => {
    vi.mocked(loadPreferences).mockResolvedValue(null);
    renderSync();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    act(() => useUI.getState().setWidgetSize("total", "medium"));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(savePreferences).toHaveBeenCalledTimes(1);
  });
});
```

NOTE for the implementer: the fake-timer + React Query interplay above (`advanceTimersByTimeAsync` flushes both pending timers and microtasks) is the primary approach. If the query promise does not resolve under fake timers in this environment, fall back to real timers: drop `vi.useFakeTimers()`, replace each `await act(async () => { await vi.advanceTimersByTimeAsync(N); })` with `await waitFor(() => { … assertion … }, { timeout: 1500 })`, and assert the negative ("does NOT save") by `await new Promise((r) => setTimeout(r, 1000))` then checking `not.toHaveBeenCalled()`. Keep the four behaviors identical.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/preferences-sync.test.tsx > /tmp/t.log 2>&1; echo "EXIT=$?"`
Expected: non-zero — component not found.

- [ ] **Step 3: Implement the component**

Create `src/components/preferences-sync.tsx`:
```tsx
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

  const { data } = useQuery({ queryKey: ["preferences"], queryFn: loadPreferences, staleTime: Infinity });
  const { mutate } = useMutation({ mutationFn: savePreferences });

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
      lastSaved.current = next;
      mutate(next);
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [layout, navConfig, mutate]);

  return null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/preferences-sync.test.tsx > /tmp/t.log 2>&1; echo "EXIT=$?"`
Expected: `EXIT=0`. (If flaky under fake timers, apply the real-timer fallback noted in Step 1.)

- [ ] **Step 5: Mount it in the (app) layout**

Replace `src/app/(app)/layout.tsx` with (adds the import + one `<PreferencesSync />` line inside `HydrationGate`):
```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { BottomNav } from "@/components/nav/bottom-nav";
import { QuickAddModal } from "@/components/nav/quick-add-modal";
import { ImportModal } from "@/components/import/import-modal";
import { HydrationGate } from "@/components/hydration-gate";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { PreferencesSync } from "@/components/preferences-sync";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  return (
    <HydrationGate>
      <ServiceWorkerRegister />
      <PreferencesSync />
      <div className="mx-auto w-full max-w-6xl px-4 pb-36 pt-6 sm:px-6 sm:pt-10">{children}</div>
      <QuickAddModal />
      <ImportModal />
      <BottomNav />
    </HydrationGate>
  );
}
```

- [ ] **Step 6: Verify lint + build + full suite**

```bash
npm run lint > /tmp/lint.log 2>&1; echo "LINT=$?"
npm run build > /tmp/build.log 2>&1; echo "BUILD=$?"
npx vitest run > /tmp/vitest.log 2>&1; echo "TEST=$?"
```
Expected: all `0`.

- [ ] **Step 7: Commit**

```bash
git add src/components/preferences-sync.tsx src/components/preferences-sync.test.tsx "src/app/(app)/layout.tsx"
git commit -m "feat(prefs): sync dashboard layout + nav config per user"
```
End the commit body with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Manual verification (after the code lands)

1. With the dev server running (`NODE_OPTIONS=--use-system-ca npm run dev`), signed in: open the dashboard, **Edit layout**, reorder/resize a widget. Wait ~1s.
2. Open a second browser (or incognito) signed in as the same Google account → the dashboard shows the **same** arrangement.
3. Change the bottom-nav config in Settings on one browser → it appears on the other after reload.
4. (Optional DB check) the `user_preferences` table has one row for your user id with the latest `layout`/`nav_config` JSON.

## Global verification

- `npx vitest run`, `npm run lint`, `npm run build` all exit 0 after each task.
- The `user_preferences` table exists in Neon (Task 1).
- `useUI` store API and all widgets are unchanged (only a new component reads/writes the store).

## Out of Scope (per spec)

Syncing `masked`/`month`/`accountFilter`; a true offline write-queue/replay; any widget or `useUI` store-API changes.
