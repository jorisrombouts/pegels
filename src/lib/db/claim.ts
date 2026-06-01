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
