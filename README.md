# Pegels

A single-user Swedish personal-finance PWA. Import your bank transactions (SEB / Revolut CSV),
auto-categorize them with an LLM that **learns from your corrections**, and get calm spending
analysis — budgets, goals, trends, and a tap-to-fix review loop.

Built with **Next.js 16** (App Router) · **Neon Postgres** + Drizzle · **OpenAI** · **Auth.js**
(Google) · Tailwind v4 · TanStack Query. Deployed on Vercel.

> Pegels is **single-owner** by design: an `OWNER_EMAIL` allowlist gates sign-in (fail-closed), so a
> fork is your own private instance. See [BACKLOG.md](./BACKLOG.md) for the multi-user discussion.

## Quick start

```bash
git clone <your-fork-url> && cd pegels
npm install
cp .env.example .env.local      # then fill in the values (see below)
npm run db:push                 # create the Neon schema
npm run db:seed                 # load the Swedish sample dataset
npm run dev                     # http://localhost:3000
```

### Environment

Fill in `.env.local` (all documented in [`.env.example`](./.env.example)):

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Neon Postgres connection string (pooled) |
| `OPENAI_API_KEY` | for AI categorization | OpenAI; without it, import uses keyword rules |
| `AUTH_SECRET` | yes | Auth.js session secret (`npx auth secret`) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | yes | Google OAuth client |
| `OWNER_EMAIL` | yes | The one Google account allowed to sign in |
| `DEV_USER_ID` | optional | Local-dev bypass — skips Google sign-in, acts as this user id. **Unset in prod.** |

With `DEV_USER_ID` set you can run locally without configuring Google at all (the seeded user is
`user-stub`). Point `DATABASE_URL` at a **separate dev database** so local work never touches real data.

## Scripts

| | |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` / `start` | Production build / serve |
| `npm test` | Vitest suite (296 tests) |
| `npm run lint` | ESLint — fails on unused imports/vars |
| `npm run lint:fix` | ESLint with autofix |
| `npm run check:docs` | Verify markdown links + source-path references resolve |
| `npm run db:push` | Sync the Drizzle schema to Neon |
| `npm run db:seed` | Load the sample dataset |
| `npm run db:generate` | Generate a SQL migration |

A Husky pre-commit hook runs `lint-staged` (ESLint + autofix on staged files) and `check:docs` on every commit.

## How it works

- **Data:** a client SPA over Neon. `useData()` is the single facade (TanStack Query over one
  `['dataset']` entry, persisted to `localStorage` for instant + offline reads); every mutation is an
  optimistic update backed by a server action.
- **Spending math** lives only in `effectiveExpense` (`src/lib/domain/`) — a tx counts iff
  `kind === "expense"`, not excluded, `amount < 0` (split → your share). Never sum `amount` directly.
- **Categorization** runs own-account-transfer detection → user rules → OpenAI few-shot → keyword
  fallback. The few-shot is built from your **corrections and approvals** and relevance-matched to the
  batch, so the model gets better the more you use it.
- **Import** parses SEB + Revolut CSV, converts non-SEK rows to SEK at today's ECB rate, dedupes, and
  detects transfer pairs.

Want to rebuild Pegels from scratch? **[PRD.md](./PRD.md)** is the requirements-first spec — domain
model, business rules, per-feature acceptance criteria, and a definition of done. Full architecture,
conventions, and the verified roadmap are in **[PLAN.md](./PLAN.md)**; requested ideas and open
decisions are in **[BACKLOG.md](./BACKLOG.md)**; design specs live in `docs/superpowers/specs/`.

## Deploy

Vercel + a Neon database. Set the same env vars in the Vercel project (leave `DEV_USER_ID` **unset** so
prod uses real Google auth), and add your production URL to the Google OAuth client's redirect URIs
(`https://your-app/api/auth/callback/google`). The PWA service worker registers in production only.

## License

[MIT](./LICENSE).
