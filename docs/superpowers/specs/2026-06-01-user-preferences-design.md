# Per-User UI Preferences Design

**Date:** 2026-06-01
**Status:** Approved

## Goal

Persist the dashboard **layout** (widget order + per-widget size) and the **bottom-nav config** (which destinations are tabs vs. under "More", and their order) per user in Neon, keyed by `getUserId()`, so they follow the user across devices instead of living only in browser `localStorage`. Other UI state — privacy `masked`, selected `month`, `accountFilter` — stays device-local.

## Decisions (confirmed with owner)

- **Sync scope:** `layout` + `navConfig` only. `masked` / `month` / `accountFilter` remain device-local in `localStorage`.
- **Source of truth:** Neon is authoritative for the two synced fields; `localStorage` becomes an instant/offline cache.
- **Conflict model:** last-write-wins across devices (single user; no merge/CRDT).
- **Approach:** a thin sync layer around the existing `useUI` Zustand store — the store API, its setters, and its `localStorage` persist are all unchanged. No widget or store-setter edits.

## Architecture

### Storage — one new table

```
user_preferences
  user_id     text  PRIMARY KEY      -- = getUserId()
  layout      jsonb NOT NULL         -- WidgetLayout[]  (id + size)
  nav_config  jsonb NOT NULL         -- NavConfigItem[] (key + primary)
  updated_at  text  NOT NULL         -- ISO timestamp; supports last-write-wins
```

One row per user. JSONB blobs mirror the in-app `WidgetLayout[]` / `NavConfigItem[]` shapes exactly, so widget changes never require a column migration. Created via the project's established one-off `tsx` `CREATE TABLE IF NOT EXISTS` migration (run with `npx tsx`, then deleted) — not `drizzle-kit push`. The table is added to `src/lib/db/schema.ts` as `userPreferences`.

### Server actions + queries

- `src/lib/db/queries.ts`:
  - `getPreferences(userId)` → `{ layout, navConfig } | null`.
  - `upsertPreferences(userId, { layout, navConfig })` → `INSERT … ON CONFLICT (user_id) DO UPDATE SET layout, nav_config, updated_at`.
- `src/app/actions/preferences.ts` (`"use server"`, scoped by `getUserId()`):
  - `loadPreferences(): Promise<{ layout: WidgetLayout[]; navConfig: NavConfigItem[] } | null>`.
  - `savePreferences(prefs: { layout: WidgetLayout[]; navConfig: NavConfigItem[] }): Promise<void>`.

### Client sync — `<PreferencesSync />`

A single `"use client"` component mounted once in the already-auth-gated `src/app/(app)/layout.tsx`. It renders `null` and owns all sync behavior; the store and widgets are untouched.

- **Load once:** `useQuery({ queryKey: ["preferences"], queryFn: loadPreferences, staleTime: Infinity })`.
  - When a server row arrives: `useUI.setState({ layout, navConfig })`, and record the loaded value in a `lastSaved` ref.
  - When the query resolves `null` (no row yet): mark hydration complete so the current local values seed the row on the first save.
- **Save on change:** an effect watching `layout` + `navConfig` debounces (~800 ms) a `savePreferences` mutation. A `lastSaved` ref (compared by serialized value) suppresses the redundant save immediately after hydration and any no-op writes.
- Guarded by a `hydrated` ref so no save fires before the initial load resolves.

Pure helper `shouldSave(prev, next): boolean` (serialized deep-equality, exported for unit testing) backs the suppression logic.

## Data Flow & Edge Cases

1. **Usual device:** `localStorage` (Zustand persist) renders the saved layout instantly — no flash. Server load matches, so no re-render and no save.
2. **Fresh device / incognito:** defaults render briefly → server prefs arrive → store updates → layout snaps to the saved arrangement. The app is **not** blocked behind the network round-trip; the brief reconcile is acceptable.
3. **Two devices:** last-write-wins on next load (`updated_at` records recency). No simultaneous-edit merging.
4. **Offline:** `loadPreferences` failure → keep `localStorage` values. A failed `savePreferences` is retried on the next change; `localStorage` holds the latest meanwhile. A true offline write-queue/replay remains a separate deferred item.
5. **Reset layout / reset nav:** the existing setters update the store → the watch effect persists the defaults to the server too.

## Testing

- **Unit (vitest):**
  - `getPreferences` / `upsertPreferences` row mapping against a mocked `db` (pattern from `src/lib/db/claim.test.ts`).
  - `shouldSave(prev, next)` — true on change, false on identical value.
- **Component (vitest + RTL, fake timers):** `<PreferencesSync />` with mocked `loadPreferences`/`savePreferences` — verifies it (a) hydrates the store from a server row, (b) seeds when the row is `null`, (c) debounce-saves on a subsequent change, and (d) does **not** save the just-hydrated value.
- **Manual:** customize the layout in one browser; open another (or incognito) signed in as the same user → the same arrangement appears.

## Out of Scope

- Syncing `masked` / `month` / `accountFilter` (stay device-local).
- A true offline write-queue/replay (deferred).
- Any widget or `useUI` store-API changes (the sync layer wraps; it does not rewrite).
- Moving `layout`/`navConfig` out of Zustand into TanStack Query as the single store (explicitly rejected in favor of the non-invasive wrapper).
