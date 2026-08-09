import { pgTable, text, numeric, real, boolean, jsonb, index, timestamp, integer, primaryKey, uniqueIndex, vector } from "drizzle-orm/pg-core";
import type { AccountKind, CategorySource, Split, TransactionKind } from "../domain/types";
import type { ConfidenceLevel } from "../ai/confidence";

/** Whether an example participates in retrieval. Only `approved` is trusted evidence. */
export type ExampleStatus = "candidate" | "approved" | "rejected";
export type ExampleSource = "import" | "detail" | "manual" | "backfill";

/** text-embedding-3-small's native width. pgvector's HNSW cap is 2000, so this indexes fine. */
export const EMBED_DIMS = 1536;

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
    categoryLevel: text("category_level").$type<ConfidenceLevel>(),
    categorySource: text("category_source").$type<CategorySource>().notNull(),
    needsReview: boolean("needs_review").notNull(),
    excluded: boolean("excluded").notNull(),
    kind: text("kind").$type<TransactionKind>().notNull(),
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


/**
 * The categorization corpus — what the model retrieves from, and what the /training page curates.
 *
 * One row per distinct merchant (`dedupKey`), not per correction: forty "ICA MAXI" corrections
 * collapse into one row with `hitCount = 40`. That keeps retrieval from being flooded by a single
 * merchant, bounds table growth, and shrinks the raw-description PII surface.
 *
 * Every added NOT NULL column carries a default so `drizzle-kit push` can ADD COLUMN in place.
 */
export const categorizationExamples = pgTable(
  "categorization_examples",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),

    /** normalizeMerchant(cleanedDescription) — the consolidation identity. */
    dedupKey: text("dedup_key").notNull().default(""),
    rawDescription: text("raw_description").notNull(),
    cleanedDescription: text("cleaned_description").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),

    // What the model said, kept so the accuracy panel can score it.
    predictedKind: text("predicted_kind").$type<TransactionKind>(),
    predictedCategoryId: text("predicted_category_id"),
    predictedConfidence: real("predicted_confidence"),

    // The labels.
    finalKind: text("final_kind").$type<TransactionKind>().notNull(),
    finalCategoryId: text("final_category_id"),
    finalTagIds: jsonb("final_tag_ids").$type<string[]>().notNull().default([]),

    // Corpus membership.
    status: text("status").$type<ExampleStatus>().notNull().default("candidate"),
    /** Held out of retrieval and scored by the eval harness. */
    corrected: boolean("corrected").notNull(),
    source: text("source").$type<ExampleSource>().notNull(),
    /** Times this merchant has been observed. Drives the lexical tie-break and the curation sort. */
    hitCount: integer("hit_count").notNull().default(1),
    createdAt: text("created_at").notNull(), // ISO string, set by the caller
    lastSeenAt: text("last_seen_at").notNull().default(""),

    // Retrieval. Nullable by design: a write never blocks on the embeddings API; a lazy
    // self-heal pass fills the gaps before the next categorization run.
    embedding: vector("embedding", { dimensions: EMBED_DIMS }),
    embeddingModel: text("embedding_model"),
  },
  (t) => [
    index("catex_user_idx").on(t.userId),
    uniqueIndex("catex_user_dedup_idx").on(t.userId, t.dedupKey), // required for onConflictDoUpdate
    index("catex_user_status_idx").on(t.userId, t.status),
    index("catex_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

/** One row per eval run, so the /training accuracy panel can show a trend rather than a snapshot. */


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

/**
 * One row per accuracy check, so the number can be shown as a trend rather than a lone figure.
 *
 * Deliberately thin: the sample is reproducible from `sampleForScoring`, so storing which places
 * were scored would duplicate something already derivable. Only the outcome is kept.
 */
export const accuracyRuns = pgTable(
  "accuracy_runs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    createdAt: text("created_at").notNull(), // ISO string, set by the caller
    sampled: integer("sampled").notNull(),
    /** Correct with the place hidden from its own lookup — a place it has never seen. */
    correct: integer("correct").notNull(),
    /** Correct with the corpus intact — a place it already knows. */
    correctSeen: integer("correct_seen").notNull().default(0),
    /** Transactions checked for coverage, and how many landed on a known place. */
    txTotal: integer("tx_total").notNull().default(0),
    txCovered: integer("tx_covered").notNull().default(0),
    corpusSize: integer("corpus_size").notNull(),
    /** The disagreements themselves, so a run says what it confused and not just how often. */
    misses: jsonb("misses").$type<{ expected: string | null; got: string | null }[]>().notNull().default([]),
  },
  (t) => [index("accuracy_runs_user_idx").on(t.userId)],
);
