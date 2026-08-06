import "@/lib/db/env";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/index";

/** Track C's pending drops, stated explicitly rather than via `push --force`. */
async function main() {
  const before = await db.execute(sql`SELECT count(*)::int AS n FROM transactions WHERE goal_id IS NOT NULL`);
  console.log("transactions with a goal link:", JSON.stringify((before as unknown as { rows: unknown[] }).rows));

  await db.execute(sql`ALTER TABLE transactions DROP COLUMN IF EXISTS goal_id`);
  console.log("dropped transactions.goal_id");
  await db.execute(sql`DROP TABLE IF EXISTS goals`);
  console.log("dropped table goals");
  await db.execute(sql`DROP TABLE IF EXISTS user_preferences`);
  console.log("dropped table user_preferences");
}
main().then(() => process.exit(0), (e) => { console.error(e.message); process.exit(1); });
