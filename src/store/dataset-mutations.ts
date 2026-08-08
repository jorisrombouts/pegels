// Pure, immutable dataset transforms. Mirror the old Zustand reducers exactly (incl. the
// removeCategory/removeTag cascades) so they can drive optimistic cache updates AND be
// unit-tested without React or a database.
import type { Dataset } from "@/data/mock";
import type { Account, Budget, Category, Tag, Transaction } from "@/lib/domain/types";

export const emptyDataset: Dataset = {
  accounts: [],
  categories: [],
  tags: [],
  transactions: [],
  budgets: [],
};

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [...list, item];
  const next = list.slice();
  next[idx] = item;
  return next;
}

export function applyUpdateTransaction(d: Dataset, id: string, patch: Partial<Transaction>): Dataset {
  return { ...d, transactions: d.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}

/** Apply many transaction patches at once — one cache write, not one per row. */
export function applyBulkTransactionPatch(
  d: Dataset,
  patches: { id: string; patch: Partial<Transaction> }[],
): Dataset {
  const byId = new Map(patches.map((p) => [p.id, p.patch]));
  if (byId.size === 0) return d;
  return { ...d, transactions: d.transactions.map((t) => (byId.has(t.id) ? { ...t, ...byId.get(t.id)! } : t)) };
}

export function applyAddTransaction(d: Dataset, tx: Transaction): Dataset {
  return { ...d, transactions: [tx, ...d.transactions] };
}

export function applyAddTransactions(d: Dataset, txs: Transaction[]): Dataset {
  return { ...d, transactions: [...txs, ...d.transactions] };
}

export function applyRemoveTransaction(d: Dataset, id: string): Dataset {
  return { ...d, transactions: d.transactions.filter((t) => t.id !== id) };
}

export function applyUpsertCategory(d: Dataset, c: Category): Dataset {
  return { ...d, categories: upsertById(d.categories, c) };
}

/** Delete a category and detach its transactions (categoryId -> null) — PRD §6.7. */
export function applyRemoveCategory(d: Dataset, id: string): Dataset {
  return {
    ...d,
    categories: d.categories.filter((c) => c.id !== id),
    transactions: d.transactions.map((t) => (t.categoryId === id ? { ...t, categoryId: null } : t)),
  };
}

export function applyUpsertTag(d: Dataset, t: Tag): Dataset {
  return { ...d, tags: upsertById(d.tags, t) };
}

/** Delete a tag and strip it from every transaction's tagIds. */
export function applyRemoveTag(d: Dataset, id: string): Dataset {
  return {
    ...d,
    tags: d.tags.filter((t) => t.id !== id),
    transactions: d.transactions.map((t) => ({ ...t, tagIds: t.tagIds.filter((x) => x !== id) })),
  };
}

export function applyUpsertAccount(d: Dataset, a: Account): Dataset {
  return { ...d, accounts: upsertById(d.accounts, a) };
}

export function applyRemoveAccount(d: Dataset, id: string): Dataset {
  return { ...d, accounts: d.accounts.filter((a) => a.id !== id) };
}

export function applyUpsertBudget(d: Dataset, b: Budget): Dataset {
  return { ...d, budgets: upsertById(d.budgets, b) };
}

export function applyRemoveBudget(d: Dataset, id: string): Dataset {
  return { ...d, budgets: d.budgets.filter((b) => b.id !== id) };
}





