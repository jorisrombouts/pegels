// Pure row <-> domain mappers. Keep the only null<->undefined and userId-injection
// logic here so it stays unit-testable without a database.
import type { Account, Category, Tag, Transaction, Budget, Goal, CategorizationRule } from "../domain/types";
import type { accounts, categories, tags, transactions, budgets, goals, categorizationRules } from "./schema";

type AccountRow = typeof accounts.$inferSelect;
type CategoryRow = typeof categories.$inferSelect;
type TagRow = typeof tags.$inferSelect;
type TransactionRow = typeof transactions.$inferSelect;
type BudgetRow = typeof budgets.$inferSelect;
type GoalRow = typeof goals.$inferSelect;
type RuleRow = typeof categorizationRules.$inferSelect;

// ── row -> domain (drop userId, null -> undefined for optional fields) ──

export function rowToAccount(r: AccountRow): Account {
  return { id: r.id, name: r.name, type: r.type, kind: r.kind, icon: r.icon, color: r.color, balance: Number(r.balance), accountNumber: r.accountNumber, archived: r.archived };
}

export function rowToCategory(r: CategoryRow): Category {
  return { id: r.id, name: r.name, icon: r.icon, color: r.color, parentId: r.parentId };
}

export function rowToTag(r: TagRow): Tag {
  return { id: r.id, name: r.name, color: r.color };
}

export function rowToTransaction(r: TransactionRow): Transaction {
  return {
    id: r.id,
    date: r.date,
    description: r.description,
    amount: Number(r.amount),
    accountId: r.accountId,
    categoryId: r.categoryId,
    predictedCategoryId: r.predictedCategoryId,
    categoryConfidence: r.categoryConfidence,
    categorySource: r.categorySource,
    needsReview: r.needsReview,
    tagIds: r.tagIds ?? [],
    splits: r.splits ?? undefined,
    notes: r.notes ?? undefined,
    kind: r.kind,
    goalId: r.goalId,
  };
}

export function rowToBudget(r: BudgetRow): Budget {
  return { id: r.id, categoryId: r.categoryId, limit: Number(r.limit), month: r.month };
}

export function rowToGoal(r: GoalRow): Goal {
  return {
    id: r.id,
    name: r.name,
    icon: r.icon,
    target: Number(r.target),
    baseline: Number(r.baseline),
    deadline: r.deadline,
    accountId: r.accountId,
  };
}

// ── domain -> row (inject userId, undefined -> null for optional fields) ──

export function accountToRow(a: Account, userId: string): AccountRow {
  return { id: a.id, userId, name: a.name, type: a.type, kind: a.kind, icon: a.icon, color: a.color, balance: String(a.balance), accountNumber: a.accountNumber ?? null, archived: a.archived };
}

export function categoryToRow(c: Category, userId: string): CategoryRow {
  return { id: c.id, userId, name: c.name, icon: c.icon, color: c.color, parentId: c.parentId };
}

export function tagToRow(t: Tag, userId: string): TagRow {
  return { id: t.id, userId, name: t.name, color: t.color };
}

export function transactionToRow(t: Transaction, userId: string): TransactionRow {
  return {
    id: t.id,
    userId,
    date: t.date,
    description: t.description,
    amount: String(t.amount),
    accountId: t.accountId,
    categoryId: t.categoryId,
    predictedCategoryId: t.predictedCategoryId,
    categoryConfidence: t.categoryConfidence,
    categorySource: t.categorySource,
    needsReview: t.needsReview,
    kind: t.kind,
    goalId: t.goalId,
    tagIds: t.tagIds,
    splits: t.splits ?? null,
    notes: t.notes ?? null,
  };
}

export function budgetToRow(b: Budget, userId: string): BudgetRow {
  return { id: b.id, userId, categoryId: b.categoryId, limit: String(b.limit), month: b.month };
}

export function goalToRow(g: Goal, userId: string): GoalRow {
  return {
    id: g.id,
    userId,
    name: g.name,
    icon: g.icon,
    target: String(g.target),
    baseline: String(g.baseline),
    deadline: g.deadline,
    accountId: g.accountId,
  };
}

export function rowToRule(r: RuleRow): CategorizationRule {
  return {
    id: r.id, priority: Number(r.priority), enabled: r.enabled,
    matchText: r.matchText, matchMode: r.matchMode,
    setCategoryId: r.setCategoryId, setKind: r.setKind,
    addTagIds: r.addTagIds ?? [], origin: r.origin,
  };
}

export function ruleToRow(rule: CategorizationRule, userId: string): RuleRow {
  return {
    id: rule.id, userId, priority: rule.priority, enabled: rule.enabled,
    matchText: rule.matchText, matchMode: rule.matchMode,
    setCategoryId: rule.setCategoryId, setKind: rule.setKind,
    addTagIds: rule.addTagIds, origin: rule.origin,
    createdAt: new Date().toISOString(),
  };
}
