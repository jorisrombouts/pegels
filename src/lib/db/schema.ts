import { pgTable, text, integer, real, boolean, jsonb, index } from "drizzle-orm/pg-core";
import type { AccountKind, CategorySource, Split, GoalContribution } from "../domain/types";

// Every table is scoped by userId (stub today; real auth later). Embedded arrays
// (tagIds, splits, contributions) are JSONB — document-scoped, never queried alone.

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    kind: text("kind").$type<AccountKind>().notNull(),
    icon: text("icon").notNull(),
    color: text("color").notNull(),
    balance: integer("balance").notNull(),
    archived: boolean("archived").notNull(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

export const categories = pgTable(
  "categories",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    icon: text("icon").notNull(),
    color: text("color").notNull(),
    parentId: text("parent_id"),
  },
  (t) => [index("categories_user_idx").on(t.userId)],
);

export const tags = pgTable(
  "tags",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    color: text("color").notNull(),
  },
  (t) => [index("tags_user_idx").on(t.userId)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    date: text("date").notNull(), // ISO yyyy-mm-dd
    description: text("description").notNull(),
    amount: integer("amount").notNull(), // signed SEK; negative = expense
    accountId: text("account_id").notNull(),
    categoryId: text("category_id"),
    predictedCategoryId: text("predicted_category_id"),
    categoryConfidence: real("category_confidence"),
    categorySource: text("category_source").$type<CategorySource>().notNull(),
    needsReview: boolean("needs_review").notNull(),
    tagIds: jsonb("tag_ids").$type<string[]>().notNull(),
    splits: jsonb("splits").$type<Split[]>(), // nullable
    notes: text("notes"),
  },
  (t) => [index("transactions_user_date_idx").on(t.userId, t.date)],
);

export const budgets = pgTable(
  "budgets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    categoryId: text("category_id").notNull(),
    limit: integer("limit").notNull(),
    month: text("month"), // "yyyy-mm" or null (repeats)
  },
  (t) => [index("budgets_user_idx").on(t.userId)],
);

export const goals = pgTable(
  "goals",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    icon: text("icon").notNull(),
    target: integer("target").notNull(),
    baseline: integer("baseline").notNull(),
    deadline: text("deadline"), // ISO date or null
    accountId: text("account_id"), // linked savings account or null
    contributions: jsonb("contributions").$type<GoalContribution[]>().notNull(),
  },
  (t) => [index("goals_user_idx").on(t.userId)],
);
