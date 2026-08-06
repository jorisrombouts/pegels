import { sql } from "drizzle-orm";
import { db } from "./index";

/**
 * Create the Postgres extensions the schema depends on.
 *
 * `drizzle-kit push` emits `vector(1536)` and `CREATE INDEX ... USING hnsw` but never
 * `CREATE EXTENSION`, so both fail on a database that hasn't got pgvector yet. This runs as a
 * preflight from `npm run db:push`. Idempotent, needs no superuser on Neon, and lives in the repo
 * so a fresh Neon branch just works.
 */
export async function ensureExtensions(): Promise<void> {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
}
