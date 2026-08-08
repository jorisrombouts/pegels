import { and, eq, sql } from "drizzle-orm";
import { db } from "./index";
import { accounts, categories, tags, transactions, budgets, categorizationExamples } from "./schema";
import {
  rowToAccount, rowToCategory, rowToTag, rowToTransaction, rowToBudget,
  accountToRow, categoryToRow, tagToRow, transactionToRow, budgetToRow,
} from "./map";
import type { Account, Category, Tag, Transaction, Budget } from "../domain/types";
import type { Dataset } from "../../data/mock";

type Batchable = Parameters<typeof db.batch>[0][number];
const batch = (ops: Batchable[]) => db.batch(ops as [Batchable, ...Batchable[]]);

/** Split a list into fixed-size slices, so one multi-row statement stays under a parameter ceiling. */
function chunked<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

// Postgres caps bind parameters at 65,535. The widest row here is transactionToRow's 17 columns
// → 3,855 rows/statement; categorization examples are 13 → 5,041. 2,000 leaves headroom for both.
const ROW_CHUNK = 2000;

// ── Reads ──

export async function getDataset(userId: string): Promise<Dataset> {
  // One Neon round-trip for all seven reads (batch) instead of seven parallel HTTP requests.
  const [accRows, catRows, tagRows, txRows, budRows] = await batch([
    db.select().from(accounts).where(eq(accounts.userId, userId)),
    db.select().from(categories).where(eq(categories.userId, userId)),
    db.select().from(tags).where(eq(tags.userId, userId)),
    db.select().from(transactions).where(eq(transactions.userId, userId)),
    db.select().from(budgets).where(eq(budgets.userId, userId)),
  ]);
  return {
    accounts: accRows.map(rowToAccount),
    categories: catRows.map(rowToCategory),
    tags: tagRows.map(rowToTag),
    transactions: txRows.map(rowToTransaction),
    budgets: budRows.map(rowToBudget),
  };
}

// ── Upserts (insert-or-update on the string PK) ──

export async function upsertTransaction(userId: string, tx: Transaction): Promise<void> {
  const row = transactionToRow(tx, userId);
  await db.insert(transactions).values(row).onConflictDoUpdate({ target: transactions.id, set: row });
}

/** Upsert many transactions as one multi-row statement per chunk (~3 round-trips at 4k rows, not 4k). */
export async function upsertTransactions(userId: string, txs: Transaction[]): Promise<void> {
  // `set` lists every column transactionToRow writes except the `id` conflict target, so an updated
  // row keeps exactly the values the caller passed — same as upsertTransaction's `set: row`.
  for (const part of chunked(txs, ROW_CHUNK)) {
    await db.insert(transactions).values(part.map((t) => transactionToRow(t, userId))).onConflictDoUpdate({
      target: transactions.id,
      set: {
        userId: sql`excluded.user_id`, date: sql`excluded.date`, description: sql`excluded.description`,
        amount: sql`excluded.amount`, accountId: sql`excluded.account_id`, categoryId: sql`excluded.category_id`,
        predictedCategoryId: sql`excluded.predicted_category_id`, categoryConfidence: sql`excluded.category_confidence`,
        categoryLevel: sql`excluded.category_level`,
        categorySource: sql`excluded.category_source`, needsReview: sql`excluded.needs_review`,
        excluded: sql`excluded.excluded`, kind: sql`excluded.kind`,
        tagIds: sql`excluded.tag_ids`, splits: sql`excluded.splits`, notes: sql`excluded.notes`,
      },
    });
  }
}

export async function insertTransactions(userId: string, txs: Transaction[]): Promise<void> {
  for (const part of chunked(txs, ROW_CHUNK)) {
    await db.insert(transactions).values(part.map((t) => transactionToRow(t, userId)));
  }
}

/** Update many transactions in one round-trip. Looping upsertTransaction would be N of them. */
export async function bulkUpsertTransactions(userId: string, txs: Transaction[]): Promise<void> {
  if (txs.length === 0) return;
  const ops = txs.map((t) => {
    const row = transactionToRow(t, userId);
    return db.insert(transactions).values(row).onConflictDoUpdate({ target: transactions.id, set: row });
  });
  await batch(ops);
}

export async function removeTransaction(userId: string, id: string): Promise<void> {
  await db.delete(transactions).where(and(eq(transactions.userId, userId), eq(transactions.id, id)));
}

export async function upsertCategory(userId: string, c: Category): Promise<void> {
  const row = categoryToRow(c, userId);
  await db.insert(categories).values(row).onConflictDoUpdate({ target: categories.id, set: row });
}

export async function upsertTag(userId: string, t: Tag): Promise<void> {
  const row = tagToRow(t, userId);
  await db.insert(tags).values(row).onConflictDoUpdate({ target: tags.id, set: row });
}

export async function upsertAccount(userId: string, a: Account): Promise<void> {
  const row = accountToRow(a, userId);
  await db.insert(accounts).values(row).onConflictDoUpdate({ target: accounts.id, set: row });
}

export async function upsertBudget(userId: string, b: Budget): Promise<void> {
  const row = budgetToRow(b, userId);
  await db.insert(budgets).values(row).onConflictDoUpdate({ target: budgets.id, set: row });
}





// ── Removes (cascades mirror the old store semantics) ──

/** Delete a category and detach its transactions (categoryId -> null), atomically. */
export async function removeCategory(userId: string, id: string): Promise<void> {
  await batch([
    db.update(transactions).set({ categoryId: null }).where(and(eq(transactions.userId, userId), eq(transactions.categoryId, id))),
    db.delete(categories).where(and(eq(categories.userId, userId), eq(categories.id, id))),
  ]);
}

/** Delete a tag and strip it from every transaction's tagIds, atomically. */
export async function removeTag(userId: string, id: string): Promise<void> {
  // The `::text` cast is load-bearing: it picks `jsonb - text` (drop matching elements), not `jsonb - integer` (drop by index).
  await batch([
    db.update(transactions).set({ tagIds: sql`${transactions.tagIds} - ${id}::text` }).where(and(eq(transactions.userId, userId), sql`${transactions.tagIds} ? ${id}`)),
    db.delete(tags).where(and(eq(tags.userId, userId), eq(tags.id, id))),
  ]);
}

export async function removeAccount(userId: string, id: string): Promise<void> {
  // No cascade — matches the prior store (transactions keep their accountId).
  await db.delete(accounts).where(and(eq(accounts.userId, userId), eq(accounts.id, id)));
}

export async function removeBudget(userId: string, id: string): Promise<void> {
  await db.delete(budgets).where(and(eq(budgets.userId, userId), eq(budgets.id, id)));
}


// ── Categorization training set ──

export async function insertCategorizationExamples(
  userId: string,
  rows: Omit<typeof categorizationExamples.$inferInsert, "userId">[],
): Promise<void> {
  for (const part of chunked(rows, ROW_CHUNK)) {
    await db.insert(categorizationExamples).values(part.map((r) => ({ ...r, userId })));
  }
}



// ── Bulk ──

export async function clearAll(userId: string): Promise<void> {
  await batch([
    db.delete(transactions).where(eq(transactions.userId, userId)),
    db.delete(budgets).where(eq(budgets.userId, userId)),
    db.delete(categories).where(eq(categories.userId, userId)),
    db.delete(tags).where(eq(tags.userId, userId)),
    db.delete(accounts).where(eq(accounts.userId, userId)),
  ]);
}

/** Replace the whole dataset for a user (used by reset-to-sample and the seed script). */
export async function replaceAll(userId: string, data: Dataset): Promise<void> {
  const ops: Batchable[] = [
    db.delete(transactions).where(eq(transactions.userId, userId)),
    db.delete(budgets).where(eq(budgets.userId, userId)),
    db.delete(categories).where(eq(categories.userId, userId)),
    db.delete(tags).where(eq(tags.userId, userId)),
    db.delete(accounts).where(eq(accounts.userId, userId)),
  ];
  if (data.accounts.length) ops.push(db.insert(accounts).values(data.accounts.map((a) => accountToRow(a, userId))));
  if (data.categories.length) ops.push(db.insert(categories).values(data.categories.map((c) => categoryToRow(c, userId))));
  if (data.tags.length) ops.push(db.insert(tags).values(data.tags.map((t) => tagToRow(t, userId))));
  if (data.transactions.length) ops.push(db.insert(transactions).values(data.transactions.map((t) => transactionToRow(t, userId))));
  if (data.budgets.length) ops.push(db.insert(budgets).values(data.budgets.map((b) => budgetToRow(b, userId))));
  await batch(ops);
}
