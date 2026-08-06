import { describe, expect, it, vi } from "vitest";
import type { Transaction } from "@/lib/domain/types";

// A real (never-connected) Drizzle instance over a stub client, so `sent` holds exactly the SQL and
// params the driver would POST — the excluded.* conflict clause and the row-per-statement count are
// the whole point of this test.
const { sent } = vi.hoisted(() => ({ sent: [] as { sql: string; params: unknown[] }[] }));
vi.mock("./index", async () => {
  const { drizzle } = await import("drizzle-orm/neon-http");
  const client = async (sql: string, params: unknown[]) => {
    sent.push({ sql, params });
    return { rows: [], rowCount: 0, fields: [], command: "INSERT" };
  };
  return { db: drizzle(client as never) };
});

import { insertTransactions, upsertTransactions } from "./queries";

const tx = (over: Partial<Transaction>): Transaction => ({
  id: "t1", date: "2026-01-10", description: "ICA Maxi", amount: -100, accountId: "acc-lon",
  categoryId: "cat-groceries", predictedCategoryId: null, categoryConfidence: null, categorySource: "model",
  needsReview: false, tagIds: [], kind: "expense", goalId: null, ...over,
});

describe("upsertTransactions", () => {
  it("writes one multi-row upsert that restates every non-key column from excluded", async () => {
    sent.length = 0;
    await upsertTransactions("u1", [tx({ id: "a" }), tx({ id: "b", notes: "n", excluded: true })]);

    expect(sent).toHaveLength(1);
    expect(sent[0].sql).toBe(
      'insert into "transactions" ("id", "user_id", "date", "description", "amount", "account_id",' +
        ' "category_id", "predicted_category_id", "category_confidence", "category_source", "needs_review",' +
        ' "excluded", "kind", "goal_id", "tag_ids", "splits", "notes") values' +
        " ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)," +
        " ($18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34)" +
        ' on conflict ("id") do update set "user_id" = excluded.user_id, "date" = excluded.date,' +
        ' "description" = excluded.description, "amount" = excluded.amount, "account_id" = excluded.account_id,' +
        ' "category_id" = excluded.category_id, "predicted_category_id" = excluded.predicted_category_id,' +
        ' "category_confidence" = excluded.category_confidence, "category_source" = excluded.category_source,' +
        ' "needs_review" = excluded.needs_review, "excluded" = excluded.excluded, "kind" = excluded.kind,' +
        ' "goal_id" = excluded.goal_id, "tag_ids" = excluded.tag_ids, "splits" = excluded.splits,' +
        ' "notes" = excluded.notes',
    );
    // 17 columns/row is the number the 65,535 bind-parameter ceiling divides into.
    expect(sent[0].params).toHaveLength(34);
    // Every column the caller passed survives the round-trip, not just the patched ones.
    expect(sent[0].params.slice(17)).toEqual([
      "b", "u1", "2026-01-10", "ICA Maxi", "-100", "acc-lon", "cat-groceries", null, null, "model",
      false, true, "expense", null, "[]", null, "n",
    ]);
  });

  it("splits a plan larger than one chunk into whole statements", async () => {
    sent.length = 0;
    await upsertTransactions("u1", Array.from({ length: 4223 }, (_, i) => tx({ id: `t${i}` })));

    // 2,000-row chunks: 2000 + 2000 + 223, and 2000 x 17 = 34,000 params stays under 65,535.
    expect(sent.map((s) => s.params.length / 17)).toEqual([2000, 2000, 223]);
    expect(Math.max(...sent.map((s) => s.params.length))).toBeLessThan(65535);
  });

  it("issues no statement at all for an empty plan", async () => {
    sent.length = 0;
    await upsertTransactions("u1", []);
    expect(sent).toEqual([]);
  });
});

describe("insertTransactions", () => {
  it("splits an import larger than one chunk into whole statements", async () => {
    sent.length = 0;
    // 4,223 rows is past the 3,855-row bind-parameter cap, so an unchunked insert would be rejected.
    await insertTransactions("u1", Array.from({ length: 4223 }, (_, i) => tx({ id: `t${i}` })));

    expect(sent.map((s) => s.params.length / 17)).toEqual([2000, 2000, 223]);
    expect(Math.max(...sent.map((s) => s.params.length))).toBeLessThan(65535);
  });

  it("issues no statement at all for an empty import", async () => {
    sent.length = 0;
    await insertTransactions("u1", []);
    expect(sent).toEqual([]);
  });
});
