import { describe, expect, it, vi } from "vitest";

type Op = { toSQL(): { sql: string; params: unknown[] } };
const { batch } = vi.hoisted(() => ({ batch: vi.fn(async (ops: Op[]) => ops) }));

// A real (never-connected) Drizzle instance, so the batched ops carry the SQL that would
// actually be sent — the `-` vs `?` operator pairing is the whole point of this test.
vi.mock("./index", async () => {
  const { drizzle } = await import("drizzle-orm/neon-http");
  const { neon } = await import("@neondatabase/serverless");
  return { db: Object.assign(drizzle(neon("postgresql://u:p@example.neon.tech/db")), { batch }) };
});

import { removeTag } from "./queries";

describe("removeTag", () => {
  it("batches one set-based jsonb strip with the tag delete", async () => {
    await removeTag("u1", "tag-subscription");

    expect(batch).toHaveBeenCalledTimes(1);
    const ops = batch.mock.calls[0][0];
    expect(ops).toHaveLength(2); // no per-row UPDATE fan-out, and no preceding SELECT
    expect(ops[0].toSQL()).toEqual({
      sql:
        'update "transactions" set "tag_ids" = "transactions"."tag_ids" - $1::text' +
        ' where ("transactions"."user_id" = $2 and "transactions"."tag_ids" ? $3)',
      params: ["tag-subscription", "u1", "tag-subscription"],
    });
    expect(ops[1].toSQL()).toEqual({
      sql: 'delete from "tags" where ("tags"."user_id" = $1 and "tags"."id" = $2)',
      params: ["u1", "tag-subscription"],
    });
  });
});
