import { beforeEach, describe, expect, it, vi } from "vitest";

const where = vi.fn(() => "OP");
const set = vi.fn(() => ({ where }));
const update = vi.fn((_table: unknown) => ({ set }));
const batch = vi.fn(async (_ops: unknown[]) => []);

vi.mock("./index", () => ({ db: { update: (t: unknown) => update(t), batch: (o: unknown[]) => batch(o) } }));

import { CLAIMABLE_TABLES, claimStubData, STUB_USER_ID } from "./claim";

describe("CLAIMABLE_TABLES", () => {
  it("covers all 6 user-scoped data tables", () => {
    expect(CLAIMABLE_TABLES).toHaveLength(6);
  });
});

describe("claimStubData", () => {
  beforeEach(() => { update.mockClear(); batch.mockClear(); });

  it("re-points every claimable table from the stub to the new user in one batch", async () => {
    await claimStubData("real-user");
    expect(update).toHaveBeenCalledTimes(6);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toHaveLength(6);
    expect(STUB_USER_ID).toBe("user-stub");
  });
});
