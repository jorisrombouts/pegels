# Google Sign-In Design

**Date:** 2026-06-01
**Status:** Approved

## Goal

Replace the hardcoded `getUserId()` stub with real **Auth.js v5 Google OAuth** sessions, scoping all existing data to the authenticated user. Restrict access to a single allowlisted email (the owner) and migrate the owner's existing `user-stub` data to their real account on first sign-in. This makes the app deploy-ready for a single real user without exposing the dataset publicly.

## Decisions (confirmed with owner)

- **Access model:** Allowlist — only `OWNER_EMAIL` may sign in. Everyone else is rejected after Google auth, before any user/session row is written.
- **Existing data:** Migrate — on the owner's first sign-in, all rows owned by `user-stub` are re-pointed to the real `users.id`.
- **Session storage:** Database sessions via `@auth/drizzle-adapter` (Neon). `users.id` becomes the app-wide `userId`.

## Stack

- `next-auth@5.0.0-beta.31` (Auth.js v5) — peer-supports `next ^16` and `react ^19` (verified against installed `next@16.2.6`, `react@19.2.4`).
- `@auth/drizzle-adapter@1.11.2`.
- Google provider only. No email/password, no other providers.
- Drizzle ORM over `drizzle-orm/neon-http` (existing).

## Architecture

### Database — 4 new Auth.js tables

Added to `src/lib/db/schema.ts`, matching the `@auth/drizzle-adapter` Postgres shape:

- `users` — `id` (text PK, default `gen_random_uuid()`/crypto), `name`, `email`, `emailVerified` (timestamp), `image`.
- `accounts` — OAuth account link (`userId` FK, `provider`, `providerAccountId`, tokens, composite PK on `(provider, providerAccountId)`).
- `sessions` — `sessionToken` (PK), `userId` FK, `expires`.
- `verificationTokens` — `(identifier, token)` composite PK, `expires`. (Unused by Google but required by the adapter contract.)

**`users.id` is the app's `userId`** everywhere the 8 data tables reference `user_id`. The 8 existing data tables are unchanged.

Tables are created in Neon via a one-off `tsx` migration script (the project's established pattern — explicit `CREATE TABLE IF NOT EXISTS`, run with `npx tsx`, then deleted), **not** `drizzle-kit push`. `users.id` uses a DB-side default so the adapter need not supply ids.

### Auth config — `src/lib/auth.ts` (rewritten)

The file currently holding the `getUserId` stub is rewritten to host the Auth.js config and the real `getUserId`:

```ts
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable, accountsTable, sessionsTable, verificationTokensTable,
  }),
  providers: [Google],
  session: { strategy: "database" },
  callbacks: {
    signIn: ({ user }) => isAllowedEmail(user.email, OWNER_EMAIL),
    session: ({ session, user }) => { session.user.id = user.id; return session; },
  },
  events: {
    createUser: async ({ user }) => {
      if (isAllowedEmail(user.email, OWNER_EMAIL)) await claimStubData(user.id);
    },
  },
});

export async function getUserId(): Promise<string> {
  const s = await auth();
  if (!s?.user?.id) throw new Error("UNAUTHENTICATED");
  return s.user.id;
}
```

- `OWNER_EMAIL` and the Google credentials come from env.
- `STUB_USER_ID = "user-stub"` constant is retained as the migration source.

### Allowlist — `isAllowedEmail`

A pure, unit-tested helper:

```ts
export function isAllowedEmail(email: string | null | undefined, owner: string): boolean {
  return !!email && !!owner && email.toLowerCase() === owner.toLowerCase();
}
```

Used in the `signIn` callback (the gate runs **before** the adapter persists any user/session/account row, so rejected users leave no trace) and re-checked in the `createUser` event before migration.

### Route handler

`src/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/lib/auth";
export const { GET, POST } = handlers;
```

### One-time stub-data migration — `claimStubData`

`events.createUser` fires only on the first-ever sign-in for a given identity. For the allowlisted owner it runs `claimStubData(newUserId)` — a new query helper in `src/lib/db/queries.ts`:

```ts
export async function claimStubData(toUserId: string): Promise<void> {
  // db.batch of UPDATE <table> SET user_id = $to WHERE user_id = STUB_USER_ID
  // across: accounts, categories, tags, transactions, budgets,
  //         categorization_rules, categorization_examples, goals
}
```

Idempotent: after the first run, no `user-stub` rows remain, so re-invocation is a no-op. Because only the allowlisted owner can sign in, stub data can only ever be claimed by the owner.

### Route protection & UI

- **Gate in `src/app/(app)/layout.tsx`** (already a server component): make it `async`, call `auth()`, `redirect("/signin")` when there's no session. This protects every page under `(app)` at once. **No middleware** — database sessions cannot be validated at the edge runtime, and layout gating is the documented, simpler pattern. Server actions independently throw via `getUserId()` (defense in depth).
- **`src/app/signin/page.tsx`** — public (outside the `(app)` group). A minimal glass card matching the app's visual language with one "Continue with Google" button wired to a `signIn("google", { redirectTo: "/" })` server action. Non-allowlisted users are redirected back with an error indicator (read from `searchParams.error`).
- **Sign-out** — a new "Account" card on the Settings page showing the signed-in email and a "Sign out" button calling a `signOut({ redirectTo: "/signin" })` server action. Settings is a client component, so sign-out is a small server-action form; **no `SessionProvider`** is introduced.

### Environment

New variables (local `.env.local` and, later, Vercel):

- `AUTH_SECRET` — session/JWT signing secret (`npx auth secret`).
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` — Google OAuth client credentials.
- `OWNER_EMAIL` — the single allowlisted Google email.

Google OAuth authorized redirect URIs: `http://localhost:3000/api/auth/callback/google` (and the production equivalent later). Auth.js auto-detects the URL on Vercel; `AUTH_URL` is only needed for non-standard hosts.

## Data Flow

1. Unauthenticated request to any `(app)` page → layout `auth()` returns null → `redirect("/signin")`.
2. `/signin` → "Continue with Google" → `signIn("google")` server action → Google consent → callback.
3. `signIn` callback checks allowlist. Rejected → back to `/signin?error=AccessDenied`, nothing persisted.
4. Allowed + first time → adapter creates the `users` row → `createUser` event runs `claimStubData(user.id)` → adapter writes the `sessions` row → session cookie set → redirect `/`.
5. Subsequent requests → `auth()` reads cookie + `sessions`/`users` rows → `getUserId()` returns `users.id` → all queries scope to the real id.

## Testing

**Unit (vitest):**
- `isAllowedEmail` — exact match, case-insensitivity, null/empty email, null/empty owner.
- `getUserId` — throws `UNAUTHENTICATED` when `auth()` returns null; returns id when present (auth mocked).
- `session` callback — copies `user.id` onto `session.user.id`.
- `claimStubData` — issues the expected UPDATEs for all 8 tables with the right from/to ids (db/batch mocked or asserted against the built statements).

**Manual (live):**
- First sign-in with the owner's Google account → existing January data, rules, categories, tags appear under the new account.
- A second, non-allowlisted Google account is rejected at `/signin` with an error.
- Sign-out returns to `/signin`; protected pages redirect there when signed out.

## Out of Scope

- Per-user persistence of dashboard layout + nav config (remains localStorage for now; moves to Neon in a later phase).
- Vercel deployment itself (this only makes the app deploy-ready).
- PWA push / overspend alerts.
- Multi-user onboarding UX (allowlist is a single email; widening is a future change).
- Standalone scripts that call `getUserId()` outside a request — none exist today; seeding runs through server actions in request context. Future scripts must pass an explicit `userId`.
