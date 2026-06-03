import { pgTable, text, numeric, real, boolean, jsonb, index, timestamp, integer, primaryKey } from "drizzle-orm/pg-core";
import type { AccountKind, CategorySource, MatchMode, RuleOrigin, Split, TransactionKind } from "../domain/types";
import type { WidgetLayout, NavConfigItem } from "../../store/ui";

// Every table is scoped by userId (stub today; real auth later). Embedded arrays
// (tagIds, splits) are JSONB — document-scoped, never queried alone.

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
    balance: numeric("balance", { precision: 12, scale: 2 }).notNull(),
    accountNumber: text("account_number"),
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
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(), // signed decimal SEK; negative = expense
    accountId: text("account_id").notNull(),
    categoryId: text("category_id"),
    predictedCategoryId: text("predicted_category_id"),
    categoryConfidence: real("category_confidence"),
    categorySource: text("category_source").$type<CategorySource>().notNull(),
    needsReview: boolean("needs_review").notNull(),
    excluded: boolean("excluded").notNull(),
    kind: text("kind").$type<TransactionKind>().notNull(),
    goalId: text("goal_id"),
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
    limit: numeric("limit", { precision: 12, scale: 2 }).notNull(),
    month: text("month"), // "yyyy-mm" or null (repeats)
  },
  (t) => [index("budgets_user_idx").on(t.userId)],
);

export const categorizationRules = pgTable(
  "categorization_rules",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    priority: real("priority").notNull(),
    enabled: boolean("enabled").notNull(),
    matchText: text("match_text").notNull(),
    matchMode: text("match_mode").$type<MatchMode>().notNull(),
    setCategoryId: text("set_category_id"),
    setKind: text("set_kind").$type<TransactionKind>(),
    addTagIds: jsonb("add_tag_ids").$type<string[]>().notNull(),
    origin: text("origin").$type<RuleOrigin>().notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("rules_user_idx").on(t.userId)],
);

export const categorizationExamples = pgTable(
  "categorization_examples",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    rawDescription: text("raw_description").notNull(),
    cleanedDescription: text("cleaned_description").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    predictedKind: text("predicted_kind").$type<TransactionKind>(),
    predictedCategoryId: text("predicted_category_id"),
    predictedConfidence: real("predicted_confidence"),
    finalKind: text("final_kind").$type<TransactionKind>().notNull(),
    finalCategoryId: text("final_category_id"),
    corrected: boolean("corrected").notNull(),
    source: text("source").$type<"import" | "detail">().notNull(),
    createdAt: text("created_at").notNull(), // ISO string, set by the caller
  },
  (t) => [index("catex_user_idx").on(t.userId)],
);

export const goals = pgTable(
  "goals",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    icon: text("icon").notNull(),
    target: numeric("target", { precision: 12, scale: 2 }).notNull(),
    baseline: numeric("baseline", { precision: 12, scale: 2 }).notNull(),
    deadline: text("deadline"), // ISO date or null
    accountId: text("account_id"), // linked savings account or null
  },
  (t) => [index("goals_user_idx").on(t.userId)],
);

// --- Auth.js (next-auth) tables. users.id is the app-wide userId. ---

export const authUsers = pgTable("auth_users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
});

export const authAccounts = pgTable(
  "auth_accounts",
  {
    userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const authSessions = pgTable("auth_sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const authVerificationTokens = pgTable(
  "auth_verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// --- Per-user UI preferences (dashboard layout + bottom-nav config). One row per user. ---
export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id").primaryKey(),
  layout: jsonb("layout").$type<WidgetLayout[]>().notNull(),
  navConfig: jsonb("nav_config").$type<NavConfigItem[]>().notNull(),
  updatedAt: text("updated_at").notNull(),
});
