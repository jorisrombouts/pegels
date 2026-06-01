# Google Sign-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `getUserId()` stub with real Auth.js v5 Google OAuth (database sessions, single-owner allowlist), migrating the owner's existing `user-stub` data to their real account on first sign-in.

**Architecture:** Auth.js v5 (`next-auth@5`) with `@auth/drizzle-adapter` stores users/accounts/sessions in Neon. `users.id` becomes the app-wide `userId`. Route protection is enforced in the `(app)` server-component layout (no middleware — database sessions can't be validated at the edge). Pure logic (allowlist, session mapping, the require-id guard, the table-claim list) lives in small tested modules; the Auth.js wiring composes them.

**Tech Stack:** Next.js 16.2.6 (App Router, server actions), React 19, `next-auth@5.0.0-beta.31`, `@auth/drizzle-adapter@1.11.2`, Drizzle ORM over `drizzle-orm/neon-http`, Neon Postgres, Vitest.

**Conventions reused:**
- Pure helpers unit-tested with Vitest (see `src/lib/domain/selectors.test.ts`).
- Explicit `tsx` `CREATE TABLE IF NOT EXISTS` migration run with `npx tsx`, then deleted — NOT `drizzle-kit push`.
- `db.batch([...])` for multi-statement writes (see `src/lib/db/queries.ts:151`).
- `getUserId()` in `src/lib/auth.ts` is the single seam, consumed only by `src/app/actions/data.ts` and `src/app/actions/ai.ts`.
- Verify with `npx vitest run`, `npm run lint`, `npm run build`. **zsh has no `PIPESTATUS`** — check exit codes WITHOUT pipes: `npm run build > /tmp/build.log 2>&1; echo "EXIT=$?"`.

---

## File Structure

**Created:**
- `src/lib/auth-helpers.ts` — pure: `isAllowedEmail`, `requireUserId`, `sessionCallback`. Tested.
- `src/lib/auth-helpers.test.ts` — tests for the above.
- `src/lib/db/claim.ts` — `STUB_USER_ID`, `CLAIMABLE_TABLES`, `claimStubData`. Tested.
- `src/lib/db/claim.test.ts` — tests for the claim list + batch call.
- `src/app/api/auth/[...nextauth]/route.ts` — Auth.js HTTP handler.
- `src/app/signin/page.tsx` — public sign-in page (outside `(app)`).
- `src/app/actions/auth.ts` — `signOutAction`, `currentUserEmail` server actions.
- `src/components/settings/account-card.tsx` — client Account section (email + sign-out).
- `src/types/next-auth.d.ts` — module augmentation adding `session.user.id`.
- `scripts/migrate-auth-tables.ts` — one-off Neon migration (deleted after running).

**Modified:**
- `src/lib/db/schema.ts` — add the 4 Auth.js tables.
- `src/lib/auth.ts` — replace stub with NextAuth config + real `getUserId`.
- `src/app/(app)/layout.tsx` — async, gate with `auth()` + `redirect`.
- `src/app/(app)/settings/page.tsx` — render `<AccountCard />`.
- `package.json` / `.env.local` — deps + env vars.

---

## Task 1: Dependencies & environment scaffolding

**Files:**
- Modify: `package.json` (via npm)
- Modify: `.env.local`

- [ ] **Step 1: Install Auth.js + adapter**

Run:
```bash
npm install next-auth@5.0.0-beta.31 @auth/drizzle-adapter@1.11.2 > /tmp/npm.log 2>&1; echo "EXIT=$?"
```
Expected: `EXIT=0`. `package.json` now lists both deps.

- [ ] **Step 2: Generate the auth secret**

Run:
```bash
npx auth secret > /tmp/secret.log 2>&1; echo "EXIT=$?"
```
Expected: `EXIT=0` and `AUTH_SECRET=...` appended to `.env.local`. If the command is unavailable, append manually:
```bash
printf '\nAUTH_SECRET=%s\n' "$(openssl rand -base64 33)" >> .env.local
```

- [ ] **Step 3: Add Google + owner placeholders to `.env.local`**

Append these keys (values filled in by the owner before live testing — leaving them empty does not break build/lint/test, which never read them):
```
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
OWNER_EMAIL=
```

- [ ] **Step 4: Confirm install**

Run:
```bash
npx vitest run > /tmp/vitest.log 2>&1; echo "EXIT=$?"
```
Expected: `EXIT=0` (existing suite still green; nothing new yet).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add next-auth v5 + drizzle adapter deps"
```
(Do NOT commit `.env.local` — it is gitignored.)

---

## Task 2: Auth.js database tables + Neon migration

**Files:**
- Modify: `src/lib/db/schema.ts:1` (imports) and append 4 tables
- Create: `scripts/migrate-auth-tables.ts` (deleted in Step 5)

- [ ] **Step 1: Extend the pg-core imports**

In `src/lib/db/schema.ts`, replace the first import line:
```ts
import { pgTable, text, numeric, real, boolean, jsonb, index } from "drizzle-orm/pg-core";
```
with:
```ts
import { pgTable, text, numeric, real, boolean, jsonb, index, timestamp, integer, primaryKey } from "drizzle-orm/pg-core";
```

- [ ] **Step 2: Append the 4 Auth.js tables**

Add at the END of `src/lib/db/schema.ts`. Names are `auth_*` to avoid clashing with the existing `accounts` table; column property keys exactly match what `@auth/drizzle-adapter` expects:
```ts
// --- Auth.js (next-auth) tables. users.id is the app-wide userId. ---

export const authUsers = pgTable("auth_users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
});

export const authAccounts = pgTable(
  "auth_accounts",
  {
    userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const authSessions = pgTable("auth_sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const authVerificationTokens = pgTable(
  "auth_verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);
```

- [ ] **Step 3: Write the migration script**

Create `scripts/migrate-auth-tables.ts`:
```ts
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  await sql`CREATE TABLE IF NOT EXISTS auth_users (
    id text PRIMARY KEY,
    name text,
    email text NOT NULL,
    email_verified timestamp,
    image text
  )`;
  await sql`CREATE TABLE IF NOT EXISTS auth_accounts (
    user_id text NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    type text NOT NULL,
    provider text NOT NULL,
    provider_account_id text NOT NULL,
    refresh_token text,
    access_token text,
    expires_at integer,
    token_type text,
    scope text,
    id_token text,
    session_state text,
    PRIMARY KEY (provider, provider_account_id)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS auth_sessions (
    session_token text PRIMARY KEY,
    user_id text NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    expires timestamp NOT NULL
  )`;
  await sql`CREATE TABLE IF NOT EXISTS auth_verification_tokens (
    identifier text NOT NULL,
    token text NOT NULL,
    expires timestamp NOT NULL,
    PRIMARY KEY (identifier, token)
  )`;
  console.log("auth tables created");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Run the migration against Neon**

Run (the `--env-file` loads `DATABASE_URL`; `--use-system-ca` avoids the corporate-TLS `fetch failed`):
```bash
NODE_OPTIONS=--use-system-ca npx tsx --env-file=.env.local scripts/migrate-auth-tables.ts > /tmp/migrate.log 2>&1; echo "EXIT=$?"
```
Expected: `EXIT=0` and `auth tables created` in `/tmp/migrate.log`. Re-running is safe (`IF NOT EXISTS`).

- [ ] **Step 5: Delete the migration script + verify typecheck/build**

```bash
rm scripts/migrate-auth-tables.ts
npm run build > /tmp/build.log 2>&1; echo "EXIT=$?"
```
Expected: `EXIT=0` (schema additions compile; tables unused so far is fine).

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(auth): add Auth.js users/accounts/sessions/verification tables"
```

---

## Task 3: Pure auth helpers

**Files:**
- Create: `src/lib/auth-helpers.ts`
- Test: `src/lib/auth-helpers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth-helpers.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { isAllowedEmail, requireUserId, sessionCallback } from "./auth-helpers";

describe("isAllowedEmail", () => {
  it("matches the owner case-insensitively", () => {
    expect(isAllowedEmail("Owner@Gmail.com", "owner@gmail.com")).toBe(true);
  });
  it("rejects a different email", () => {
    expect(isAllowedEmail("intruder@gmail.com", "owner@gmail.com")).toBe(false);
  });
  it("rejects null/empty email or owner", () => {
    expect(isAllowedEmail(null, "owner@gmail.com")).toBe(false);
    expect(isAllowedEmail("owner@gmail.com", "")).toBe(false);
    expect(isAllowedEmail(undefined, undefined as unknown as string)).toBe(false);
  });
});

describe("requireUserId", () => {
  it("returns the id when present", () => {
    expect(requireUserId({ user: { id: "u1" } })).toBe("u1");
  });
  it("throws when session is null", () => {
    expect(() => requireUserId(null)).toThrow("UNAUTHENTICATED");
  });
  it("throws when user id is missing", () => {
    expect(() => requireUserId({ user: {} })).toThrow("UNAUTHENTICATED");
  });
});

describe("sessionCallback", () => {
  it("copies the adapter user id onto session.user.id", () => {
    const session = { user: { email: "a@b.com" } } as never;
    const out = sessionCallback({ session, user: { id: "u9" } } as never);
    expect(out.user.id).toBe("u9");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/auth-helpers.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"`
Expected: non-zero — module/function not found.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/auth-helpers.ts`:
```ts
import type { Session } from "next-auth";
import type { AdapterUser } from "next-auth/adapters";

/** True only when `email` equals the single allowlisted owner (case-insensitive). */
export function isAllowedEmail(email: string | null | undefined, owner: string | null | undefined): boolean {
  return !!email && !!owner && email.toLowerCase() === owner.toLowerCase();
}

/** Extract the user id from a session, throwing if unauthenticated. */
export function requireUserId(session: { user?: { id?: string } } | null): string {
  const id = session?.user?.id;
  if (!id) throw new Error("UNAUTHENTICATED");
  return id;
}

/** Database-session callback: surface the adapter user's id on session.user.id. */
export function sessionCallback({ session, user }: { session: Session; user: AdapterUser }): Session {
  session.user.id = user.id;
  return session;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/auth-helpers.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"`
Expected: `EXIT=0`, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth-helpers.ts src/lib/auth-helpers.test.ts
git commit -m "feat(auth): pure allowlist + session helpers"
```

---

## Task 4: Stub-data claim (one-time migration logic)

**Files:**
- Create: `src/lib/db/claim.ts`
- Test: `src/lib/db/claim.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/db/claim.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const where = vi.fn(() => "OP");
const set = vi.fn(() => ({ where }));
const update = vi.fn(() => ({ set }));
const batch = vi.fn(async () => []);

vi.mock("./index", () => ({ db: { update: (...a: unknown[]) => update(...a), batch: (...a: unknown[]) => batch(...a) } }));

import { CLAIMABLE_TABLES, claimStubData, STUB_USER_ID } from "./claim";

describe("CLAIMABLE_TABLES", () => {
  it("covers all 8 user-scoped data tables", () => {
    expect(CLAIMABLE_TABLES).toHaveLength(8);
  });
});

describe("claimStubData", () => {
  beforeEach(() => { update.mockClear(); batch.mockClear(); });

  it("re-points every claimable table from the stub to the new user in one batch", async () => {
    await claimStubData("real-user");
    expect(update).toHaveBeenCalledTimes(8);
    expect(batch).toHaveBeenCalledTimes(1);
    expect((batch.mock.calls[0][0] as unknown[]).length).toBe(8);
    expect(STUB_USER_ID).toBe("user-stub");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/db/claim.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"`
Expected: non-zero — module not found.

- [ ] **Step 3: Implement the claim**

Create `src/lib/db/claim.ts`:
```ts
import { eq } from "drizzle-orm";
import { db } from "./index";
import {
  accounts, categories, tags, transactions,
  budgets, goals, categorizationRules, categorizationExamples,
} from "./schema";

/** The original single-user owner id. Source of the one-time data migration. */
export const STUB_USER_ID = "user-stub";

/** Every user-scoped data table whose rows must follow the owner to their real account. */
export const CLAIMABLE_TABLES = [
  accounts, categories, tags, transactions,
  budgets, goals, categorizationRules, categorizationExamples,
] as const;

type Batchable = Parameters<typeof db.batch>[0][number];

/**
 * One-time, idempotent migration: re-point all rows owned by STUB_USER_ID to `toUserId`.
 * After the first run no stub rows remain, so re-invocation is a harmless no-op.
 */
export async function claimStubData(toUserId: string): Promise<void> {
  const ops = CLAIMABLE_TABLES.map((table) =>
    db.update(table).set({ userId: toUserId }).where(eq(table.userId, STUB_USER_ID)),
  ) as Batchable[];
  await db.batch(ops as [Batchable, ...Batchable[]]);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/db/claim.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"`
Expected: `EXIT=0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/claim.ts src/lib/db/claim.test.ts
git commit -m "feat(auth): one-time stub-data claim migration"
```

---

## Task 5: Auth.js config, real getUserId, route handler

**Files:**
- Create: `src/types/next-auth.d.ts`
- Modify: `src/lib/auth.ts` (full rewrite)
- Create: `src/app/api/auth/[...nextauth]/route.ts`

- [ ] **Step 1: Add the session type augmentation**

Create `src/types/next-auth.d.ts`:
```ts
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}
```

- [ ] **Step 2: Rewrite `src/lib/auth.ts`**

Replace the entire contents of `src/lib/auth.ts`:
```ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "./db";
import { authUsers, authAccounts, authSessions, authVerificationTokens } from "./db/schema";
import { isAllowedEmail, requireUserId, sessionCallback } from "./auth-helpers";
import { claimStubData } from "./db/claim";

const OWNER_EMAIL = process.env.OWNER_EMAIL;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: authUsers,
    accountsTable: authAccounts,
    sessionsTable: authSessions,
    verificationTokensTable: authVerificationTokens,
  }),
  providers: [Google],
  session: { strategy: "database" },
  pages: { signIn: "/signin" },
  callbacks: {
    // Allowlist gate — runs before the adapter persists any row.
    signIn: ({ user }) => isAllowedEmail(user.email, OWNER_EMAIL),
    session: sessionCallback,
  },
  events: {
    // First-ever sign-in only: claim the owner's existing stub-owned data.
    createUser: async ({ user }) => {
      if (isAllowedEmail(user.email, OWNER_EMAIL)) await claimStubData(user.id);
    },
  },
});

/** The single auth seam. Returns the authenticated user's id or throws UNAUTHENTICATED. */
export async function getUserId(): Promise<string> {
  return requireUserId(await auth());
}
```
Note: `./db` resolves to `src/lib/db/index.ts` (its `db` export). The old `STUB_USER_ID` export moved to `src/lib/db/claim.ts`; nothing else imported it (verified — only `auth.ts` referenced it).

- [ ] **Step 3: Add the route handler**

Create `src/app/api/auth/[...nextauth]/route.ts`:
```ts
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 4: Verify lint + build**

Run:
```bash
npm run lint > /tmp/lint.log 2>&1; echo "LINT=$?"
npm run build > /tmp/build.log 2>&1; echo "BUILD=$?"
```
Expected: `LINT=0` and `BUILD=0`. The build compiles the Auth.js config and the actions that call `getUserId()` (no signature change — still `Promise<string>`).

- [ ] **Step 5: Verify the full unit suite is still green**

Run: `npx vitest run > /tmp/vitest.log 2>&1; echo "EXIT=$?"`
Expected: `EXIT=0`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth.ts src/app/api/auth/\[...nextauth\]/route.ts src/types/next-auth.d.ts
git commit -m "feat(auth): wire NextAuth Google config + real getUserId"
```

---

## Task 6: Route protection, sign-in page, sign-out

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Create: `src/app/signin/page.tsx`
- Create: `src/app/actions/auth.ts`
- Create: `src/components/settings/account-card.tsx`
- Modify: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Gate the app layout**

Edit `src/app/(app)/layout.tsx` — make it async and redirect unauthenticated users. Replace the file with:
```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { BottomNav } from "@/components/nav/bottom-nav";
import { QuickAddModal } from "@/components/nav/quick-add-modal";
import { ImportModal } from "@/components/import/import-modal";
import { HydrationGate } from "@/components/hydration-gate";
import { ServiceWorkerRegister } from "@/components/service-worker-register";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  return (
    <HydrationGate>
      <ServiceWorkerRegister />
      <div className="mx-auto w-full max-w-6xl px-4 pb-36 pt-6 sm:px-6 sm:pt-10">{children}</div>
      <QuickAddModal />
      <ImportModal />
      <BottomNav />
    </HydrationGate>
  );
}
```

- [ ] **Step 2: Add auth server actions**

Create `src/app/actions/auth.ts`:
```ts
"use server";

import { auth, signIn, signOut } from "@/lib/auth";

export async function signInWithGoogle(): Promise<void> {
  await signIn("google", { redirectTo: "/" });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/signin" });
}

export async function currentUserEmail(): Promise<string | null> {
  const session = await auth();
  return session?.user?.email ?? null;
}
```

- [ ] **Step 3: Build the sign-in page**

Create `src/app/signin/page.tsx` (public; `searchParams` is a Promise in Next 16):
```tsx
import { signInWithGoogle } from "@/app/actions/auth";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <div className="glass w-full max-w-sm rounded-3xl p-8 text-center">
        <h1 className="font-display text-2xl font-bold">Pegels</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to continue</p>

        {error && (
          <p className="mt-4 rounded-lg bg-[hsl(var(--negative)/0.12)] px-3 py-2 text-xs text-negative">
            This account isn’t allowed to sign in.
          </p>
        )}

        <form action={signInWithGoogle} className="mt-6">
          <button
            type="submit"
            className="pressable w-full rounded-full bg-[hsl(var(--primary))] px-4 py-3 text-sm font-semibold text-[hsl(var(--primary-foreground))]"
          >
            Continue with Google
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build the Account card**

Create `src/components/settings/account-card.tsx`:
```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, SectionLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { currentUserEmail, signOutAction } from "@/app/actions/auth";

export function AccountCard() {
  const { data: email } = useQuery({
    queryKey: ["session-email"],
    queryFn: () => currentUserEmail(),
    staleTime: Infinity,
  });

  return (
    <Card>
      <SectionLabel className="mb-3">Account</SectionLabel>
      <div className="flex items-center justify-between gap-4">
        <p className="min-w-0 truncate text-sm text-muted-foreground">{email ?? "Signed in"}</p>
        <form action={signOutAction}>
          <Button type="submit" variant="glass">Sign out</Button>
        </form>
      </div>
    </Card>
  );
}
```

- [ ] **Step 5: Render the Account card in Settings**

In `src/app/(app)/settings/page.tsx`, add the import near the other imports:
```tsx
import { AccountCard } from "@/components/settings/account-card";
```
and render `<AccountCard />` as the first child inside the settings container — change:
```tsx
      <div className="mx-auto max-w-xl space-y-4">
        <AppearanceSection />
```
to:
```tsx
      <div className="mx-auto max-w-xl space-y-4">
        <AccountCard />
        <AppearanceSection />
```

- [ ] **Step 6: Verify lint + build + tests**

Run:
```bash
npm run lint > /tmp/lint.log 2>&1; echo "LINT=$?"
npm run build > /tmp/build.log 2>&1; echo "BUILD=$?"
npx vitest run > /tmp/vitest.log 2>&1; echo "TEST=$?"
```
Expected: `LINT=0`, `BUILD=0`, `TEST=0`.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/layout.tsx" src/app/signin/page.tsx src/app/actions/auth.ts src/components/settings/account-card.tsx "src/app/(app)/settings/page.tsx"
git commit -m "feat(auth): route protection, sign-in page, sign-out"
```

---

## Manual verification (owner, after the code lands)

These require real Google credentials and cannot be automated here.

1. **Create a Google OAuth client** (Google Cloud Console → Credentials → OAuth client ID → Web application). Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`. Copy the client id/secret into `.env.local` (`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`) and set `OWNER_EMAIL` to your Google email.
2. **Restart the dev server** with `NODE_OPTIONS=--use-system-ca npm run dev` (system-CA flag avoids the corporate-TLS `fetch failed` on VPN).
3. Visit `http://localhost:3000` → redirected to `/signin` → "Continue with Google" → consent → land on the dashboard. Confirm your existing January data, rules, categories, and tags are all present (stub data claimed).
4. Open Settings → Account → confirm your email shows → "Sign out" → redirected to `/signin`; visiting `/` redirects back to `/signin`.
5. (Optional) Sign in with a different, non-allowlisted Google account → rejected back to `/signin` with the "not allowed" message; no rows written for it.

---

## Global verification

- `npx vitest run`, `npm run lint`, `npm run build` all exit 0 after each task.
- The 4 `auth_*` tables exist in Neon (Task 2 migration).
- `getUserId()` signature unchanged (`Promise<string>`), so `actions/data.ts` and `actions/ai.ts` need no edits.

## Out of scope (per spec)

Per-user dashboard-layout/nav persistence, Vercel deploy, PWA push, multi-user onboarding.
