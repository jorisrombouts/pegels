# Backlog — requested ideas & open decisions

Where **unscoped** ideas, open product **decisions**, and **risks** live before they're committed.
This is the idea funnel; the committed near-term roadmap is in `PLAN.md`. When an item is picked up
it gets a design spec in `docs/superpowers/specs/`, is built, and then graduates to `PLAN.md`'s
**Feature inventory** (and drops off this list).

Each item is tagged **Type** (Feature / Decision / Risk) and **Status** (idea · exploring ·
needs-decision · blocking). For a public repo, GitHub Issues/Discussions are a good votable companion.

> **Upstream decision that gates several items below:** does pegels stay **single-owner** (today's
> `OWNER_EMAIL` allowlist, fail-closed) or become **multi-user**? Integration auth, onboarding, and
> compliance all branch on this — decide it first.

---

## Open decisions

### Single-owner vs multi-user · Decision · ⛔ blocks others
The app is currently locked to one allowlisted Google account. Going multi-user unlocks integration
and onboarding work but makes compliance a hard prerequisite (see Risks). Everything is already keyed
by `getUserId()`, so the data model is ready — the gap is signup/authz, tenant-isolation hardening,
and the compliance assessment. **Decide this before scoping integration/onboarding/compliance.**

---

## Feature ideas

### Integration — API / MCP · Feature · idea
Let other tools (or an AI assistant) read/write pegels data.
- **MCP server** is the natural, on-brand fit: expose tools like `query_spending`,
  `list_transactions`, `add_transaction`, `categorize` so an assistant can answer "how much on
  groceries in May?" or add a cash expense. The server actions are already the data boundary, so an
  MCP layer is a thin wrapper over them.
- **REST/RPC API** for third-party apps/webhooks — heavier; needs an API-key/OAuth story.
- Open Qs: auth for non-browser clients (per-user API tokens?); read-only first vs read-write; rate
  limits; which entities are exposed. Depends on the single-owner-vs-multi-user decision.

### Onboarding — first-run guidance · Feature · idea
New users land with no orientation (empty or seeded app). Add a first-run flow:
- choose **"explore the sample data"** vs **"import my bank CSV"**;
- a short guided tour: dashboard → transactions → the **review loop** (correct/approve teaches the
  categorizer) → rules → budgets;
- empty-state hints ("Import a SEB/Revolut CSV to begin", "Approve or fix flagged rows to teach the
  categorizer").
- Open Qs: tour vs checklist vs inline empty-states; how much to explain the AI/learning loop. Value
  is highest if going multi-user.

---

## Risks / must-resolve-before-multi-user

### Compliance, PII & data security · Risk · ⛔ blocks multi-user
pegels handles **sensitive financial PII** — transaction descriptions + amounts, plus Google
name/email/photo. Today's single-owner allowlist keeps this contained; **sharing with other users
changes the risk profile materially.** Before opening signups, assess:
- **Sub-processors:** OpenAI receives transaction descriptions + amounts at categorization time; Neon
  (DB), Vercel (hosting), and Google (auth) also process data. Need data-processing terms/DPAs, and to
  confirm + document that OpenAI API data isn't used to train models (it isn't by default).
- **GDPR** (EU/Swedish users): lawful basis, data minimization, and rights to **access / export /
  erasure**. A `clearData` path exists; add per-user **export** and **delete-my-account**.
- **Tenant isolation:** every query is keyed by `getUserId()` — audit that no path can leak across
  users; consider Postgres **row-level security** as defense-in-depth.
- **Sensitive logs:** `categorization_examples` stores raw descriptions — include it in export/delete,
  and consider what's strictly needed to send to OpenAI (e.g. amount may be omittable).
- **At rest / in transit:** Neon encrypts at rest, TLS in transit — confirm + document.

This is an **assessment** (and some small features: export/delete), not a single feature. Do it
**before** multi-user.
