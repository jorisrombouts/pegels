import { beforeEach, describe, expect, it, vi } from "vitest";

const where = vi.fn(() => "OP");
const set = vi.fn(() => ({ where }));
const update = vi.fn(() => ({ set }));
const batch = vi.fn(async () => []);

vi.mock("./index", () => ({ db: { update: (...a: unknown[]) => update(...a), batch: (...a: unknown[]) => batch(...a) } }));

import { CLAIMABLE_TABLES, claimStubData, STUB_USER_ID } from "./claim";

describe("CLAIMABLE_TABLES", () => {
  it("covers all 8 user-scoped data tables", () => {
    expect(CLAIMABLE_TABLES).toHaveLength(8);
  });
});

describe("claimStubData", () => {
  beforeEach(() => { update.mockClear(); batch.mockClear(); });

  it("re-points every claimable table from the stub to the new user in one batch", async () => {
    await claimStubData("real-user");
    expect(update).toHaveBeenCalledTimes(8);
    expect(batch).toHaveBeenCalledTimes(1);
    expect((batch.mock.calls[0][0] as unknown[]).length).toBe(8);
    expect(STUB_USER_ID).toBe("user-stub");
  });
});
