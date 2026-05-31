# User-defined categorization rules — design

- **Date:** 2026-05-31
- **Project:** pegels (Next.js + Neon/Drizzle personal-finance PWA)
- **Status:** Approved (brainstorm), ready for implementation plan

## Context

Categorization today runs a fixed ladder during import (`src/app/actions/ai.ts`
`categorizeTransactions`): hardcoded deterministic rules (`classifyRules` in
`src/lib/categorize.ts` — REVOLUT/SEB KORT/AMEX/AVANZA → transfer, LÖN → income,
LÅN → mortgage) and own-account-number detection (`matchesOwnAccount`) run first;
everything else goes to the OpenAI model; a keyword categorizer is the fallback when
the API is unavailable. A self-improving training set (`categorization_examples`) feeds
recent corrections back as few-shot examples.

Two real problems remain: (1) the LLM struggles when a bank description is poor/cryptic,
and (2) some merchants are *always* the same category — re-asking the LLM each import is
wasteful and occasionally wrong. The hardcoded rules that solve this are **invisible and
uneditable** by the user.

The user has **manually corrected every category and tag for January (2026-01)**. That is a
clean labeled dataset (description → kind/category/tags) we can mine. Inspection of the live
data: 107 January transactions, 55 distinct descriptions, **53/55 map to a single
kind+category**; high-frequency merchants (`ica supermar` ×16, `stora coop v` ×9, `sl` ×8,
`revolut 022` ×4) are obvious rule candidates; corrections carry tags too
(`lån …` → Mortgage **#Fixed cost**, `enkla vardag` → Services **#Fixed cost**,
`1235076716` → Other **#Swish group**). Tag corrections live on the **transactions** table,
not in `categorization_examples` (which tracks only kind/category) — so mining means reading
transactions.

## Goals

- A **user-controlled Rules page** to create, edit, reorder, enable/disable, and delete
  deterministic categorization rules — full CRUD in the UI, same feel as the
  Categories/Tags/Budgets editors. No rule logic that the user can't see and change.
- Rules run **on import before the LLM** (a matched row skips inference) and can be
  **backfilled** to existing transactions on demand.
- **Suggest rules from a chosen month's corrected data** (January now), which the user
  reviews and approves — never auto-applied blind.
- **Unify** the existing hardcoded keyword rules into the same editable system.

## Non-goals (YAGNI)

- No amount/account/regex match conditions — description-only (contains/starts-with/exact).
  Almost all of the user's data is description-driven.
- No auto-apply without review; no fully automatic rule generation.
- No mining of all months at once — suggestions are per-month, on demand.
- Own-account-number → transfer detection is **not** turned into editable rows (it is
  data-driven from account numbers); it stays code-driven and is shown read-only.
- The keyword fallback categorizer (`categorize`) is kept as-is for the API-down case.

## Decisions

| Topic | Decision |
|---|---|
| Workflow | Suggest-and-approve + manual editor; nothing auto-applies without confirmation |
| Match | Description only, `matchMode` = `contains` \| `startsWith` \| `exact`, case-insensitive |
| Outcome | `setCategoryId` and/or `setKind` and/or `addTagIds` — each optional, ≥1 required; tags are **added**, not replaced |
| When rules run | On import before the LLM (match → skip LLM); plus on-demand backfill to existing rows |
| Precedence | Ordered list, **first enabled match wins** (user reorders via `priority`) |
| Manual edits | Backfill **never overwrites** a transaction with `categorySource:"user"`; import applies to fresh rows freely |
| Built-ins | `classifyRules` keyword rules become `origin:"seed"` editable rows; own-account detection stays code-driven, shown as a read-only "system" rule |
| Suggestions | Mined from one chosen month; a description suggested when it appears **≥2×** with one consistent `(kind, categoryId, tagIds)`; short/ambiguous matches flagged |

## Data model

### `CategorizationRule` (`src/lib/domain/types.ts`)
```ts
type MatchMode = "contains" | "startsWith" | "exact";
type RuleOrigin = "seed" | "manual" | "suggested";

interface CategorizationRule {
  id: string;
  priority: number;        // lower wins first; defines list order
  enabled: boolean;
  matchText: string;       // matched case-insensitively against the description
  matchMode: MatchMode;
  setCategoryId: string | null;
  setKind: TransactionKind | null;
  addTagIds: string[];     // added to the transaction's existing tags (union)
  origin: RuleOrigin;
}
```
Invariant: at least one of `setCategoryId`, `setKind`, `addTagIds.length > 0` is set.

### Drizzle table `categorization_rules` (`src/lib/db/schema.ts`)
`id` (text pk), `user_id` (text, not null, indexed), `priority` (integer, not null),
`enabled` (boolean, not null), `match_text` (text, not null),
`match_mode` (text, not null), `set_category_id` (text, null), `set_kind` (text, null),
`add_tag_ids` (jsonb, not null, default `[]`), `origin` (text, not null),
`created_at` (text, not null). Applied via a one-off `ALTER`/`CREATE TABLE` tsx script
(the project runs explicit SQL migrations, not `drizzle-kit push`).

### First-class entity wiring
Like categories/tags/budgets, rules flow through the whole stack:
- `Dataset` gains `rules: CategorizationRule[]`; `src/data/mock.ts` seeds the built-in
  rules (see Migration).
- `src/lib/db/map.ts`: `rowToRule` / `ruleToRow` (numeric/jsonb conversions).
- `src/lib/db/queries.ts`: include rules in `getDataset`; `upsertRule`, `removeRule`,
  `replaceAll` handling; rules included in `clearAll`.
- `src/app/actions/data.ts`: `upsertRule`, `removeRule` server actions.
- `src/store/data.ts` (`useData`): expose `rules` plus `upsertRule`, `removeRule`, and
  `reorderRules` (persists new `priority` values), with optimistic reducers in `map.ts`
  store-mutator section.

## Rule engine (`src/lib/rules.ts`, pure)

```ts
interface RuleOutcome { categoryId?: string; kind?: TransactionKind; addTagIds?: string[]; }
function matchesRule(description: string, rule: CategorizationRule): boolean;  // mode + case-insensitive
function applyRules(description: string, rules: CategorizationRule[]): RuleOutcome | null;
```
`applyRules` sorts enabled rules by `priority`, returns the first match's outcome (mapping
`setCategoryId`/`setKind`/`addTagIds`), or `null` if none match. No I/O — fully unit-testable.
Short-match helper `isRiskyMatch(matchText, matchMode)` (e.g. `contains` with ≤2 chars) is
exported for the suggestion UI to flag.

## Categorize pipeline (`src/app/actions/ai.ts`)

The import ladder becomes, per row, first hit wins and skips the rest:
```
1. own-account match (matchesOwnAccount, code-driven)  → transfer
2. applyRules(description, userRules)                  → outcome (skip LLM)
3. OpenAI LLM                                           → kind/category
4. keyword fallback (categorize), only on LLM error
```
`categorizeTransactions` loads `data.rules`, applies steps 1–2 deterministically, sends only
the unresolved rows to the LLM. The rule branch of `classifyRules` is **removed** (its content
migrates to seed rows); `matchesOwnAccount` and the keyword `categorize` fallback stay.

**Short-circuit mechanic (first-match-wins, made explicit):** `applyRules` returns the
**first** matching rule's outcome — it does not merge across rules. The row **skips the LLM**
when that outcome resolves categorization: it sets a `categoryId`, or sets `kind` to
`income`/`transfer` (which need no category). A rule that sets only tags (or only
`kind:"expense"`) is applied, but the row **still goes to the LLM** for its category, carrying
the rule's tags/kind forward. To set both a tag and a category, put both on one rule (e.g.
`lån` → Mortgage + #Fixed cost).

## Backfill (`src/app/actions/` — new `applyRulesToExisting`)

Mirrors the savings-number backfill pattern. For the stub user: load transactions, run
`applyRules` over each, and for matches **skip rows where `categorySource === "user"`** (this
protects all hand-corrected data, including January). A dry-run mode returns the count +
sample of what would change; the write mode applies `categoryId`/`kind` and unions
`addTagIds` into `tagIds`. Rule-applied categories use `categorySource:"model"` — the same
deterministic/auto bucket as the import ladder and the LLM (no new source value, no schema or
detail-panel change); they remain overwritable by a later manual edit or a re-run. The Rules
page offers backfill after approving suggestions or saving a rule ("Apply to N existing
matching, skipping hand-corrected — Preview / Apply / Skip").

## Suggestion engine (`src/lib/rules.ts`, pure)

```ts
interface SuggestedRule {
  matchText: string; matchMode: "contains";
  setCategoryId: string | null; setKind: TransactionKind | null; addTagIds: string[];
  count: number; risky: boolean;
}
function suggestRulesFromMonth(
  transactions: Transaction[], monthKey: string, existingRules: CategorizationRule[],
): SuggestedRule[];
```
Steps: filter to `monthKey`; group by normalized description (lowercased, trimmed); keep a
group iff `count >= 2` and all rows share one `(kind, categoryId, sorted tagIds)` signature;
drop groups already matched by an existing enabled rule; emit a suggestion with the
consensus outcome (`setKind` only when it differs from the sign-derived default, so most
expense suggestions carry just category + tags); set `risky` when `isRiskyMatch`; sort by
`count` desc. Pure → unit-testable; the OpenAI client is never involved.

## UI

### Rules page (`src/app/(app)/rules/page.tsx` + `src/components/rules/*`)
Reached from **Settings** (link) and addable to the customizable nav.
- **List** in priority order: a read-only **system row** ("🔒 own account numbers → Transfer")
  at top, then user rules with a drag handle (reorder → `reorderRules`), an enabled toggle,
  the match shown as `mode "text"`, the outcome as chips (category icon+name · kind badge ·
  tag chips), edit (✏️) and delete (🗑️).
- **New rule / edit** (`rule-editor.tsx`): match mode select + text input; category select
  (reusing `orderCategories`); kind select (incl. "leave as-is"); tag multi-select; Save
  disabled until ≥1 outcome is set. Same component shape as `category-editor`/`account-editor`.
- **Generate suggestions:** a month picker → review panel (`rule-suggestions.tsx`) listing
  `SuggestedRule`s with checkboxes (non-risky pre-checked), occurrence counts, a "risky match"
  warning chip, and inline-editable outcome; **Approve selected** creates `origin:"suggested"`
  rules, then prompts the backfill flow.

## Migration / seeding

- One-off tsx script: `CREATE TABLE categorization_rules …`, then insert the current
  `classifyRules` keywords as `origin:"seed"` rows for the stub user with ascending
  `priority` (REVOLUT/SEB KORT/AMEX/AVANZA → Transfer; LÖN → Income; LÅN → Mortgage +
  add #Fixed cost). Idempotent (`onConflictDoUpdate` by id).
- `src/data/mock.ts`: add the same seed rules to `seedDataset.rules` so a fresh reseed has
  them; `Dataset`/`replaceAll` updated.
- Remove the rule branch from `classifyRules` (the function is retired; the keyword
  `categorize` fallback and `matchesOwnAccount` remain). Update `categorize.test.ts`.

## Testing

- `applyRules`: priority ordering, each match mode, first-match-wins, disabled rules skipped,
  outcome mapping, null when no match.
- `suggestRulesFromMonth`: ≥2 threshold, consistency requirement, skip-already-covered,
  `risky` flag for short matches, count + sort, `setKind` omitted for sign-default expenses.
- Backfill: skips `categorySource:"user"`, unions tags, dry-run count correct.
- Pipeline (`ai.test.ts`): a rule hit skips the LLM; own-account runs before rules; tag-only
  rule still routes to the LLM for a category; fallback on LLM error unchanged.
- Store: `upsertRule`/`removeRule`/`reorderRules` optimistic reducers; `getDataset` maps rules.

## Verification

`npm test` + `npm run lint` + `npm run build` green; migration creates the table and seeds
built-in rules; reseed clean. Manual: create a rule in the Rules page → import re-runs skip
the LLM for matches; generate suggestions from January → review → approve → backfill preview
shows the right count and leaves hand-corrected January rows untouched; reorder changes which
rule wins; disabling a rule falls back to the LLM.

## Out of scope (noted)

- Amount/account/regex conditions; per-rule confidence; rule import/export.
- Auth/multi-user (stub user only, as today).
- Turning own-account detection into editable rows.
- Mining all months automatically or on a schedule.
