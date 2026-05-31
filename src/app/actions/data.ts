"use server";

import { getUserId } from "@/lib/auth";
import { seedDataset } from "@/data/mock";
import * as q from "@/lib/db/queries";
import type { Account, Category, Tag, Transaction, Budget, Goal, CategorizationRule } from "@/lib/domain/types";
import type { Dataset } from "@/data/mock";

// Read path: the TanStack Query `queryFn`.
export async function loadDataset(): Promise<Dataset> {
  return q.getDataset(await getUserId());
}

// Write path: one action per mutation. updateTransaction/addTransaction both upsert the
// full transaction (the client merges the patch optimistically, then sends the whole row).
export async function upsertTransaction(tx: Transaction): Promise<void> {
  return q.upsertTransaction(await getUserId(), tx);
}

export async function addTransactions(txs: Transaction[]): Promise<void> {
  return q.insertTransactions(await getUserId(), txs);
}

export async function upsertCategory(c: Category): Promise<void> {
  return q.upsertCategory(await getUserId(), c);
}

export async function removeCategory(id: string): Promise<void> {
  return q.removeCategory(await getUserId(), id);
}

export async function upsertTag(t: Tag): Promise<void> {
  return q.upsertTag(await getUserId(), t);
}

export async function removeTag(id: string): Promise<void> {
  return q.removeTag(await getUserId(), id);
}

export async function upsertAccount(a: Account): Promise<void> {
  return q.upsertAccount(await getUserId(), a);
}

export async function removeAccount(id: string): Promise<void> {
  return q.removeAccount(await getUserId(), id);
}

export async function upsertBudget(b: Budget): Promise<void> {
  return q.upsertBudget(await getUserId(), b);
}

export async function removeBudget(id: string): Promise<void> {
  return q.removeBudget(await getUserId(), id);
}

export async function upsertGoal(g: Goal): Promise<void> {
  return q.upsertGoal(await getUserId(), g);
}

export async function removeGoal(id: string): Promise<void> {
  return q.removeGoal(await getUserId(), id);
}

export async function upsertRule(r: CategorizationRule): Promise<void> {
  return q.upsertRule(await getUserId(), r);
}

export async function removeRule(id: string): Promise<void> {
  return q.removeRule(await getUserId(), id);
}

export async function reorderRules(orderedIds: string[]): Promise<void> {
  return q.reorderRules(await getUserId(), orderedIds);
}

export async function clearData(): Promise<void> {
  return q.clearAll(await getUserId());
}

export async function resetData(): Promise<void> {
  return q.replaceAll(await getUserId(), seedDataset);
}
