import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "./index";
import { accounts, categories, tags, transactions, budgets, goals, categorizationExamples, categorizationRules, userPreferences } from "./schema";
import {
  rowToAccount, rowToCategory, rowToTag, rowToTransaction, rowToBudget, rowToGoal, rowToRule,
  accountToRow, categoryToRow, tagToRow, transactionToRow, budgetToRow, goalToRow, ruleToRow,
} from "./map";
import type { Account, Category, Tag, Transaction, Budget, Goal, CategorizationRule } from "../domain/types";
import type { WidgetLayout, NavConfigItem } from "../../store/ui";
import type { Dataset } from "../../data/mock";

type Batchable = Parameters<typeof db.batch>[0][number];
const batch = (ops: Batchable[]) => db.batch(ops as [Batchable, ...Batchable[]]);

// ── Reads ──

export async function getDataset(userId: string): Promise<Dataset> {
  // One Neon round-trip for all seven reads (batch) instead of seven parallel HTTP requests.
  const [accRows, catRows, tagRows, txRows, budRows, goalRows, ruleRows] = await batch([
    db.select().from(accounts).where(eq(accounts.userId, userId)),
    db.select().from(categories).where(eq(categories.userId, userId)),
    db.select().from(tags).where(eq(tags.userId, userId)),
    db.select().from(transactions).where(eq(transactions.userId, userId)),
    db.select().from(budgets).where(eq(budgets.userId, userId)),
    db.select().from(goals).where(eq(goals.userId, userId)),
    db.select().from(categorizationRules).where(eq(categorizationRules.userId, userId)),
  ]);
  return {
    accounts: accRows.map(rowToAccount),
    categories: catRows.map(rowToCategory),
    tags: tagRows.map(rowToTag),
    transactions: txRows.map(rowToTransaction),
    budgets: budRows.map(rowToBudget),
    goals: goalRows.map(rowToGoal),
    rules: ruleRows.map(rowToRule),
  };
}

// ── Upserts (insert-or-update on the string PK) ──

export async function upsertTransaction(userId: string, tx: Transaction): Promise<void> {
  const row = transactionToRow(tx, userId);
  await db.insert(transactions).values(row).onConflictDoUpdate({ target: transactions.id, set: row });
}

export async function insertTransactions(userId: string, txs: Transaction[]): Promise<void> {
  if (txs.length === 0) return;
  await db.insert(transactions).values(txs.map((t) => transactionToRow(t, userId)));
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

export async function upsertGoal(userId: string, g: Goal): Promise<void> {
  const row = goalToRow(g, userId);
  await db.insert(goals).values(row).onConflictDoUpdate({ target: goals.id, set: row });
}

export async function upsertRule(userId: string, r: CategorizationRule): Promise<void> {
  const row = ruleToRow(r, userId);
  await db.insert(categorizationRules).values(row).onConflictDoUpdate({ target: categorizationRules.id, set: row });
}

export async function removeRule(userId: string, id: string): Promise<void> {
  await db.delete(categorizationRules).where(and(eq(categorizationRules.userId, userId), eq(categorizationRules.id, id)));
}

export async function reorderRules(userId: string, orderedIds: string[]): Promise<void> {
  if (!orderedIds.length) return;
  await batch(
    orderedIds.map((id, i) =>
      db.update(categorizationRules).set({ priority: (i + 1) * 10 }).where(and(eq(categorizationRules.userId, userId), eq(categorizationRules.id, id))),
    ),
  );
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

export async function removeGoal(userId: string, id: string): Promise<void> {
  await db.delete(goals).where(and(eq(goals.userId, userId), eq(goals.id, id)));
}

// ── Categorization training set ──

export async function insertCategorizationExamples(
  userId: string,
  rows: Omit<typeof categorizationExamples.$inferInsert, "userId">[],
): Promise<void> {
  if (!rows.length) return;
  await db.insert(categorizationExamples).values(rows.map((r) => ({ ...r, userId })));
}

export async function recentCategorizationExamples(userId: string, limit = 40) {
  const rows = await db
    .select()
    .from(categorizationExamples)
    .where(eq(categorizationExamples.userId, userId))
    .orderBy(desc(categorizationExamples.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    cleanedDescription: r.cleanedDescription,
    finalKind: r.finalKind,
    finalCategoryId: r.finalCategoryId,
  }));
}

/**
 * The user's explicit affirmations — the high-signal few-shot source: every correction (corrected=true,
 * incl. import edits) plus detail-panel approvals (source='detail', corrected=false). Excludes passive
 * import-keeps (the AI agreeing with itself).
 */
export async function affirmedExamples(userId: string, limit = 60) {
  const rows = await db
    .select()
    .from(categorizationExamples)
    .where(
      and(
        eq(categorizationExamples.userId, userId),
        or(eq(categorizationExamples.corrected, true), eq(categorizationExamples.source, "detail")),
      ),
    )
    .orderBy(desc(categorizationExamples.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    cleanedDescription: r.cleanedDescription,
    finalKind: r.finalKind,
    finalCategoryId: r.finalCategoryId,
  }));
}

// ── Bulk ──

export async function clearAll(userId: string): Promise<void> {
  await batch([
    db.delete(transactions).where(eq(transactions.userId, userId)),
    db.delete(budgets).where(eq(budgets.userId, userId)),
    db.delete(goals).where(eq(goals.userId, userId)),
    db.delete(categories).where(eq(categories.userId, userId)),
    db.delete(tags).where(eq(tags.userId, userId)),
    db.delete(accounts).where(eq(accounts.userId, userId)),
    db.delete(categorizationRules).where(eq(categorizationRules.userId, userId)),
  ]);
}

export async function getPreferences(
  userId: string,
): Promise<{ layout: WidgetLayout[]; navConfig: NavConfigItem[] } | null> {
  const rows = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId));
  const r = rows[0];
  return r ? { layout: r.layout, navConfig: r.navConfig } : null;
}

export async function upsertPreferences(
  userId: string,
  prefs: { layout: WidgetLayout[]; navConfig: NavConfigItem[] },
): Promise<void> {
  const row = {
    userId,
    layout: prefs.layout,
    navConfig: prefs.navConfig,
    updatedAt: new Date().toISOString(),
  };
  await db
    .insert(userPreferences)
    .values(row)
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { layout: row.layout, navConfig: row.navConfig, updatedAt: row.updatedAt },
    });
}

/** Replace the whole dataset for a user (used by reset-to-sample and the seed script). */
export async function replaceAll(userId: string, data: Dataset): Promise<void> {
  const ops: Batchable[] = [
    db.delete(transactions).where(eq(transactions.userId, userId)),
    db.delete(budgets).where(eq(budgets.userId, userId)),
    db.delete(goals).where(eq(goals.userId, userId)),
    db.delete(categories).where(eq(categories.userId, userId)),
    db.delete(tags).where(eq(tags.userId, userId)),
    db.delete(accounts).where(eq(accounts.userId, userId)),
    db.delete(categorizationRules).where(eq(categorizationRules.userId, userId)),
  ];
  if (data.accounts.length) ops.push(db.insert(accounts).values(data.accounts.map((a) => accountToRow(a, userId))));
  if (data.categories.length) ops.push(db.insert(categories).values(data.categories.map((c) => categoryToRow(c, userId))));
  if (data.tags.length) ops.push(db.insert(tags).values(data.tags.map((t) => tagToRow(t, userId))));
  if (data.transactions.length) ops.push(db.insert(transactions).values(data.transactions.map((t) => transactionToRow(t, userId))));
  if (data.budgets.length) ops.push(db.insert(budgets).values(data.budgets.map((b) => budgetToRow(b, userId))));
  if (data.goals.length) ops.push(db.insert(goals).values(data.goals.map((g) => goalToRow(g, userId))));
  if (data.rules.length) ops.push(db.insert(categorizationRules).values(data.rules.map((r) => ruleToRow(r, userId))));
  await batch(ops);
}
