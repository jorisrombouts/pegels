# Vercel Deploy + Local-Dev Branch Isolation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship pegels to production on Vercel (auto-deploy from `main`) against the existing Neon DB + Google sign-in, while moving local development onto an isolated, mock-seeded Neon `dev` branch that needs no Google sign-in.

**Architecture:** Production reuses the current Neon database (real data) and the existing Google OAuth client — so the only repo change is a tiny, env-gated `DEV_USER_ID` bypass in the auth seam that lets local dev act as the seed user. Local dev points `.env.local` at a new Neon `dev` branch (created as a copy of prod, so it gets wiped then mock-seeded). Vercel builds in its own cloud, so the local `--use-system-ca` VPN workaround is never needed there.

**Tech Stack:** Next.js 16, Auth.js v5 (`next-auth` + `@auth/drizzle-adapter`, database sessions), Neon Postgres + Drizzle (`neon-http`), Vercel, Vitest.

**Conventions:** zsh has no PIPESTATUS — check exit codes without pipes (`cmd > /tmp/x.log 2>&1; echo "EXIT=$?"`). Neon access from this machine needs `NODE_OPTIONS=--use-system-ca` (corporate VPN TLS interception). Never commit `.env.local` (gitignored). Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File structure

- **Modify** `src/lib/auth-helpers.ts` — add a pure `resolveUserId(devUserId, session)` (the unmocked, unit-tested home of the bypass rule; `@/lib/auth` itself is globally mocked in tests).
- **Modify** `src/lib/auth-helpers.test.ts` — tests for `resolveUserId`.
- **Modify** `src/lib/auth.ts` — `getUserId()` delegates to `resolveUserId`, reading `process.env.DEV_USER_ID`.
- **Create then delete** `wipe-dev.ts` (repo root) — one-off, guarded script that deletes every row on whatever DB `.env.local` points at (used once against the `dev` branch). Never committed.
- **Local only, not committed:** `.env.local` — repoint `DATABASE_URL` to the dev branch and add `DEV_USER_ID=user-stub`.
- **No change:** `next.config.ts`, `vercel.json` (none needed — Next.js is auto-detected), `src/lib/db/seed.ts` (reused as-is).

Tasks 1–2 are code/local-ops I (the agent) perform. Tasks 3–4 are **MANUAL** steps the user performs in the Vercel and Google Cloud dashboards (I cannot click in their browser). Task 5 is joint verification.

---

## Task 1: `DEV_USER_ID` auth bypass (code, TDD)

**Files:**
- Modify: `src/lib/auth-helpers.ts`
- Test: `src/lib/auth-helpers.test.ts`
- Modify: `src/lib/auth.ts:37-39`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/auth-helpers.test.ts` (it already imports from `./auth-helpers`; add `resolveUserId` to that import):

```ts
describe("resolveUserId", () => {
  it("returns the dev override when one is set", () => {
    expect(resolveUserId("user-stub", null)).toBe("user-stub");
  });

  it("falls back to the session user id when there is no override", () => {
    expect(resolveUserId(undefined, { user: { id: "u1" } })).toBe("u1");
  });

  it("throws when there is no override and no session", () => {
    expect(() => resolveUserId(undefined, null)).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/auth-helpers.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"`
Expected: FAIL — `resolveUserId` is not exported.

- [ ] **Step 3: Implement `resolveUserId`**

In `src/lib/auth-helpers.ts`, add after `requireUserId`:

```ts
/**
 * The active user id. A local-dev override (DEV_USER_ID — set only in .env.local, never on
 * Vercel) wins so local development needs no Google sign-in; otherwise a real session is required.
 */
export function resolveUserId(devUserId: string | undefined, session: { user?: { id?: string } } | null): string {
  if (devUserId) return devUserId;
  return requireUserId(session);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/auth-helpers.test.ts > /tmp/t.log 2>&1; echo "EXIT=$?"`
Expected: PASS.

- [ ] **Step 5: Wire it into `getUserId()`**

In `src/lib/auth.ts`, swap `requireUserId` for `resolveUserId` in the `./auth-helpers` import (`getUserId` no longer calls `requireUserId` directly, so leaving it in would be an unused import):

```ts
import { isAllowedEmail, resolveUserId, sessionCallback } from "./auth-helpers";
```

Replace the `getUserId` body (lines 37-39):

```ts
export async function getUserId(): Promise<string> {
  const dev = process.env.DEV_USER_ID; // local-dev bypass; unset on Vercel → real auth
  return resolveUserId(dev, dev ? null : await auth());
}
```

- [ ] **Step 6: Verify the whole suite + lint + build**

Run each, checking exit codes without pipes:
```
npx vitest run > /tmp/t.log 2>&1; echo "TEST=$?"
npm run lint > /tmp/l.log 2>&1; echo "LINT=$?"
npm run build > /tmp/b.log 2>&1; echo "BUILD=$?"
```
Expected: all `=0`.

- [ ] **Step 7: Commit and push**

```bash
git add src/lib/auth.ts src/lib/auth-helpers.ts src/lib/auth-helpers.test.ts
git commit -m "$(printf 'feat(auth): DEV_USER_ID bypass for local dev\n\ngetUserId() returns DEV_USER_ID when set (only in .env.local, never on\nVercel), so local development against the mock-seeded dev branch needs no\nGoogle sign-in. Pure resolveUserId() in auth-helpers carries the rule and\nis unit-tested.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
git push
```

---

## Task 2: Isolate local dev on the Neon `dev` branch (mock data)

The `dev` branch was created as a **copy of prod**, so it currently holds real financials. This task repoints local dev at it, wipes it, and seeds the mock dataset. **`replaceAll` (used by `db:seed`) only deletes the seed user's rows — it will NOT remove the copied real-user rows — so an explicit full wipe is required first.**

**Files:**
- Create then delete: `wipe-dev.ts` (repo root)
- Local only: `.env.local`

- [ ] **Step 1: Capture the prod `DATABASE_URL` for Vercel first**

Before repointing `.env.local`, note its current `DATABASE_URL` value (the real-data/prod branch) — it's needed for Task 3. Run:
```
grep '^DATABASE_URL=' .env.local
```
Keep that value; it becomes Vercel's production `DATABASE_URL`.

- [ ] **Step 2: Repoint `.env.local` at the dev branch + add the bypass**

Edit `.env.local`:
- Set `DATABASE_URL=` to the **dev branch** connection string (from Neon → `dev` branch → Connection Details).
- Add a line: `DEV_USER_ID=user-stub`

(Leave `OPENAI_API_KEY`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `OWNER_EMAIL` unchanged.)

- [ ] **Step 3: Create the guarded wipe script**

Create `wipe-dev.ts` at the repo root:

```ts
import "./src/lib/db/env"; // loads DATABASE_URL from .env.local (MUST be the dev branch)
import { db } from "./src/lib/db";
import {
  transactions, budgets, goals, categorizationExamples, categorizationRules,
  categories, tags, accounts, userPreferences,
  authAccounts, authSessions, authVerificationTokens, authUsers,
} from "./src/lib/db/schema";

async function main() {
  if (process.env.CONFIRM_WIPE !== "dev") {
    console.error("Refusing to run without CONFIRM_WIPE=dev");
    process.exit(1);
  }
  console.log("Wiping ALL rows on host:", new URL(process.env.DATABASE_URL!).host);
  // Children before parents (auth_accounts/auth_sessions FK -> auth_users).
  for (const t of [transactions, budgets, goals, categorizationExamples, categorizationRules,
                   categories, tags, accounts, userPreferences,
                   authAccounts, authSessions, authVerificationTokens, authUsers]) {
    await db.delete(t);
  }
  console.log("done: dev branch wiped");
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Wipe the dev branch (verify the host first!)**

Run:
```
CONFIRM_WIPE=dev NODE_OPTIONS=--use-system-ca npx tsx wipe-dev.ts > /tmp/wipe.log 2>&1; echo "EXIT=$?"; cat /tmp/wipe.log
```
Expected: prints `Wiping ALL rows on host: <your-dev-branch-host>` then `done: dev branch wiped`, EXIT=0. **Confirm the printed host is the dev branch endpoint, not prod.** If it shows the prod host, STOP — `.env.local` was not repointed.

- [ ] **Step 5: Seed the mock dataset**

Run:
```
NODE_OPTIONS=--use-system-ca npm run db:seed > /tmp/seed.log 2>&1; echo "EXIT=$?"; cat /tmp/seed.log
```
Expected: `Seeded user "user-stub": N accounts, …`, EXIT=0.

- [ ] **Step 6: Delete the wipe script**

```bash
rm wipe-dev.ts
```
(It is never committed.)

- [ ] **Step 7: Verify local dev shows mock data, not real data**

Start the dev server and open it:
```
NODE_OPTIONS=--use-system-ca npm run dev -- -p 8000
```
Expected: the app loads **without a Google sign-in prompt** (the `DEV_USER_ID` bypass) and shows the **mock** dataset (the seeded accounts/transactions), NOT your real data (e.g. the real Revolut "Trolltunga Norway As" row is absent). Stop the server when done.

---

## Task 3: Vercel project + env vars + first deploy (MANUAL — user)

- [ ] **Step 1: Import the repo**

In Vercel: **Add New → Project → import the `pegels` GitHub repo.** Framework auto-detects as Next.js; leave build settings default.

- [ ] **Step 2: Add the 6 production env vars (before deploying)**

In the import wizard's Environment Variables (Production scope), add — values copied from your local `.env.local`:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the **prod** branch string saved in Task 2 Step 1 (real data) |
| `OPENAI_API_KEY` | from `.env.local` |
| `AUTH_SECRET` | from `.env.local` |
| `AUTH_GOOGLE_ID` | from `.env.local` |
| `AUTH_GOOGLE_SECRET` | from `.env.local` |
| `OWNER_EMAIL` | your Gmail (allowlist) |

**Do NOT add `DEV_USER_ID` or `NODE_OPTIONS`.** Setting `DEV_USER_ID` on Vercel would disable real auth.

- [ ] **Step 3: Deploy and note the domain**

Click **Deploy**. When it finishes, note the production domain (e.g. `https://pegels.vercel.app`). The build should succeed (routes are dynamic/server-rendered; no DB access at build time).

---

## Task 4: Google OAuth redirect URI (MANUAL — user)

- [ ] **Step 1: Add the prod redirect URI + origin**

Google Cloud Console → **APIs & Services → Credentials →** open the OAuth 2.0 Client ID matching `AUTH_GOOGLE_ID`:
- **Authorized JavaScript origins** → add `https://<your-vercel-domain>`
- **Authorized redirect URIs** → add `https://<your-vercel-domain>/api/auth/callback/google`
- **Save** (propagation can take a few minutes).

- [ ] **Step 2: Confirm the consent screen allows your email**

**APIs & Services → OAuth consent screen** → publishing status **Testing**, and your Gmail listed under **Test users**.

---

## Task 5: Production verification

- [ ] **Step 1: Sign in**

Open the production URL → click sign in → complete Google → you land in the app. (If you get `redirect_uri_mismatch`, the Task 4 URI doesn't exactly match the domain. If you get `UntrustedHost`, add `trustHost: true` to the `NextAuth({...})` config in `src/lib/auth.ts`, commit, push — Vercel auto-redeploys.)

- [ ] **Step 2: Real data shows**

Confirm the dashboard/transactions show your **real** data (the same rows you have locally pre-isolation), proving prod points at the real Neon branch and the allowlist mapped you to the owner id.

- [ ] **Step 3: DB write + OpenAI both work from Vercel**

Open the import modal, import a small CSV (or re-open an existing transaction and recategorize) → confirm it persists (DB write reachable) and that an OpenAI categorization runs without error (OpenAI reachable). 

- [ ] **Step 4: Auto-deploy works**

Confirm the Task 1 push (or any later push to `main`) triggered a Vercel production deployment.

---

## Out of scope / notes
- **PWA install** — Serwist deps are present but unwired (`next.config.ts` is bare, no `sw.ts`/`manifest.ts`); installable-PWA is a separate effort.
- **Preview deploys** won't complete Google sign-in (their per-deploy URLs aren't in the redirect allowlist) — acceptable for a single-user app; only production auth matters.
- **`trustHost`** — not added preemptively (Auth.js v5 auto-trusts host on Vercel); it's the documented fallback in Task 5 Step 1 only if a host error appears.
- The dev branch and prod branch are independent Neon branches — local writes never touch prod.
