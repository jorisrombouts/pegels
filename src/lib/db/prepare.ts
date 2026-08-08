import { sql } from "drizzle-orm";
import { db } from "./index";
import { planConsolidation, type LegacyExample } from "../corpus/consolidate";

/**
 * Make the database safe for `drizzle-kit push`.
 *
 * Two things push cannot do for us:
 *
 *  1. **Extensions.** Push emits `vector(1536)` and `CREATE INDEX ... USING hnsw` but never
 *     `CREATE EXTENSION`, so both fail on a database without pgvector.
 *
 *  2. **The unique `(user_id, dedup_key)` index.** Push would add `dedup_key` with its `''`
 *     default and create the unique index in the same run — but every existing row would hold
 *     `''`, so the index creation fails outright. The column has to exist, be populated, and the
 *     duplicates collapsed *first*. That is the corpus migration, and it has to run here rather
 *     than as an ordinary backfill for exactly this reason.
 *
 * Idempotent: safe to run against a fresh database, a half-migrated one, or one already done.
 */
export interface PrepareResult {
  consolidated: number;
  removed: number;
  dryRun: boolean;
}

export async function prepareDatabase(opts: { dryRun?: boolean } = {}): Promise<PrepareResult> {
  const dryRun = opts.dryRun ?? false;

  // Nothing to migrate on a database that has never run the old logging code.
  const exists = await db.execute(sql`SELECT to_regclass('public.categorization_examples') AS t`);
  const table = ((exists as unknown as { rows: { t: string | null }[] }).rows ?? [])[0]?.t;

  if (dryRun) {
    if (!table) return { consolidated: 0, removed: 0, dryRun };
    const raw = await db.execute(sql`
      SELECT id, user_id, cleaned_description, final_kind, final_category_id, corrected, source, created_at
      FROM categorization_examples
    `);
    const plan = planConsolidation(toLegacy(raw));
    return { consolidated: plan.keep.length, removed: plan.deleteIds.length, dryRun };
  }

  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  await dropRetiredTables();
  if (!table) return { consolidated: 0, removed: 0, dryRun };

  // Add the corpus columns ahead of push so the data migration below has somewhere to write.
  // Push will then find them already correct and only need to add the indexes.
  await db.execute(sql`
    ALTER TABLE categorization_examples
      ADD COLUMN IF NOT EXISTS dedup_key       text    NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS final_tag_ids   jsonb   NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS status          text    NOT NULL DEFAULT 'candidate',
      ADD COLUMN IF NOT EXISTS gold            boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS hit_count       integer NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS last_seen_at    text    NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS embedding_model text
  `);

  await backfillConfidenceLevels();

  const raw = await db.execute(sql`
    SELECT id, user_id, cleaned_description, final_kind, final_category_id, corrected, source, created_at
    FROM categorization_examples
    WHERE dedup_key = ''
  `);
  const rows = toLegacy(raw);
  if (!rows.length) return { consolidated: 0, removed: 0, dryRun };

  const plan = planConsolidation(rows);

  for (const k of plan.keep) {
    await db.execute(sql`
      UPDATE categorization_examples
      SET dedup_key = ${k.dedupKey},
          status = ${k.status},
          gold = ${k.gold},
          hit_count = ${k.hitCount},
          last_seen_at = ${k.lastSeenAt},
          final_kind = ${k.finalKind},
          final_category_id = ${k.finalCategoryId}
      WHERE id = ${k.id}
    `);
  }
  // Delete last: if this run is interrupted, the survivors are already keyed and a re-run
  // simply finds fewer `dedup_key = ''` rows to process.
  for (let i = 0; i < plan.deleteIds.length; i += 500) {
    const batch = plan.deleteIds.slice(i, i + 500);
    await db.execute(sql`DELETE FROM categorization_examples WHERE id IN ${batch}`);
  }

  return { consolidated: plan.keep.length, removed: plan.deleteIds.length, dryRun };
}

/**
 * Drop what the savings-goals and layout-editing removal left behind.
 *
 * These are gone from `schema.ts`, so push wants to drop them anyway — but it cannot do it
 * unattended. Seeing tables in the database that aren't in the schema *and* a new table in the
 * schema that isn't in the database, it can't tell a drop from a rename, and stops to ask
 * ("is eval_runs a renamed goals?"). Doing the drops explicitly here removes the question, which
 * is also how they get stated in reviewable code rather than answered at an interactive prompt.
 *
 * Idempotent, and a no-op on any database that never had them.
 */
async function dropRetiredTables(): Promise<void> {
  await db.execute(sql`ALTER TABLE transactions DROP COLUMN IF EXISTS goal_id`);
  await db.execute(sql`DROP TABLE IF EXISTS goals`);
  await db.execute(sql`DROP TABLE IF EXISTS user_preferences`);
  // Rules are replaced by retrieval over the corpus. NOTE: nothing migrates them first — this is a
  // plain drop. Hand-written rules ("origin":"manual") encode knowledge no prompt prior can
  // reconstruct, e.g. a rule naming a person. That knowledge survives only where the corpus already
  // holds corrections for the same merchant, which is not guaranteed. Before running this against a
  // database that still has rules, dump the table and check the manual ones are covered:
  //   SELECT * FROM categorization_rules WHERE origin = 'manual';
  await db.execute(sql`DROP TABLE IF EXISTS categorization_rules`);
}

/**
 * Give existing rows a confidence level, derived from the score they were stored with.
 *
 * Confidence became categorical because the raw number is uncalibrated. Old rows only have the
 * number, so this maps them onto the closest honest label using the thresholds the old UI used —
 * approximate by construction, and it self-corrects as rows are re-categorized.
 */
async function backfillConfidenceLevels(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS category_level text
  `);
  await db.execute(sql`
    UPDATE transactions SET category_level =
      CASE
        WHEN category_source = 'user' THEN NULL
        WHEN category_confidence IS NULL THEN NULL
        WHEN category_confidence >= 0.85 THEN 'high'
        WHEN category_confidence >= 0.6  THEN 'medium'
        ELSE 'low'
      END
    WHERE category_level IS NULL AND category_source <> 'user'
  `);
  // The levels were first named confirmed/likely/unsure. Rows written under those names carry the
  // same meaning, so rename in place rather than re-deriving them from the score.
  await db.execute(sql`
    UPDATE transactions SET category_level =
      CASE category_level
        WHEN 'confirmed' THEN 'high'
        WHEN 'likely'    THEN 'medium'
        WHEN 'unsure'    THEN 'low'
      END
    WHERE category_level IN ('confirmed', 'likely', 'unsure')
  `);
}

function toLegacy(raw: unknown): LegacyExample[] {
  const rows = (raw as { rows?: Record<string, unknown>[] }).rows ?? (raw as Record<string, unknown>[]);
  return rows.map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    cleanedDescription: String(r.cleaned_description),
    finalKind: r.final_kind as LegacyExample["finalKind"],
    finalCategoryId: r.final_category_id === null ? null : String(r.final_category_id),
    corrected: Boolean(r.corrected),
    source: String(r.source),
    createdAt: String(r.created_at),
  }));
}
