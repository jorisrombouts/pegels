import { describe, expect, it, vi, beforeEach } from "vitest";

const { getDatasetMock, categorizeWithOpenAIMock, retrieveMock } = vi.hoisted(() => ({
  getDatasetMock: vi.fn(),
  categorizeWithOpenAIMock: vi.fn(),
  retrieveMock: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({ getDataset: getDatasetMock }));
vi.mock("@/lib/ai/categorize-openai", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  categorizeWithOpenAI: categorizeWithOpenAIMock,
}));
// Retrieval reaches the database, so this must be a full factory — importOriginal would pull in
// Neon and throw on the missing connection string.
vi.mock("@/lib/ai/retrieve", () => ({ retrieveNeighbours: retrieveMock }));
// vitest.setup.ts stubs @/app/actions/ai globally (Neon import guard); test the real module.
vi.unmock("@/app/actions/ai");

import { categorizeTransactions } from "./ai";

beforeEach(() => {
  getDatasetMock.mockReset();
  categorizeWithOpenAIMock.mockReset();
  retrieveMock.mockReset();
  retrieveMock.mockResolvedValue(new Map());
  getDatasetMock.mockResolvedValue({
    accounts: [
      { id: "acc-spar", name: "SEB Savings", accountNumber: "99887766554" },
    ],
    categories: [
      { id: "cat-groceries", name: "Groceries" },
      { id: "cat-mortgage", name: "Mortgage" },
    ],
    tags: [{ id: "tag-fixed", name: "Fixed cost" }],
    rules: [
      { id: "r-ica", priority: 10, enabled: true, matchText: "ica", matchMode: "contains", setCategoryId: "cat-groceries", setKind: null, addTagIds: ["tag-fixed"], origin: "manual" },
      { id: "r-revolut", priority: 20, enabled: true, matchText: "revolut", matchMode: "contains", setCategoryId: null, setKind: "transfer", addTagIds: [], origin: "manual" },
      { id: "r-avanza", priority: 21, enabled: true, matchText: "avanza", matchMode: "contains", setCategoryId: null, setKind: "transfer", addTagIds: [], origin: "manual" },
      { id: "r-lon", priority: 22, enabled: true, matchText: "lön", matchMode: "contains", setCategoryId: null, setKind: "income", addTagIds: [], origin: "manual" },
      { id: "r-bolan", priority: 23, enabled: true, matchText: "bolån", matchMode: "contains", setCategoryId: "cat-mortgage", setKind: null, addTagIds: [], origin: "manual" },
    ],
  });
});

describe("categorizeTransactions", () => {
  it("applies deterministic rules without calling OpenAI", async () => {
    categorizeWithOpenAIMock.mockResolvedValue([]);
    const out = await categorizeTransactions([
      { index: 0, description: "REVOLUT TOPUP", amount: -500 },
      { index: 1, description: "LÖN ACME AB", amount: 30000 },
      { index: 2, description: "BOLÅN RÄNTA", amount: -4000 },
    ]);
    expect(categorizeWithOpenAIMock).not.toHaveBeenCalled();
    expect(out[0]).toMatchObject({ index: 0, kind: "transfer", categoryId: null, confidence: 1 });
    expect(out[1]).toMatchObject({ index: 1, kind: "income", categoryId: null, confidence: 1 });
    expect(out[2]).toMatchObject({ index: 2, kind: "expense", categoryId: "cat-mortgage", confidence: 1 });
  });

  it("classifies a row referencing an own account number as a transfer", async () => {
    categorizeWithOpenAIMock.mockResolvedValue([]);
    const out = await categorizeTransactions([
      { index: 0, description: "Överföring 99887766554", amount: 5000 },
    ]);
    expect(categorizeWithOpenAIMock).not.toHaveBeenCalled();
    expect(out[0]).toMatchObject({ index: 0, kind: "transfer", categoryId: null, confidence: 1 });
  });

  it("merges OpenAI results for non-ruled rows", async () => {
    categorizeWithOpenAIMock.mockResolvedValue([
      { index: 1, kind: "expense", categoryId: "cat-groceries", tagIds: [], confidence: 0.9 },
    ]);
    const out = await categorizeTransactions([
      { index: 0, description: "AVANZA", amount: -1000 },
      { index: 1, description: "KVANTUM", amount: -350 },
    ]);
    expect(categorizeWithOpenAIMock).toHaveBeenCalledOnce();
    expect(out[0]).toMatchObject({ kind: "transfer", categoryId: null }); // rule
    // Confidence is re-anchored on the retrieval evidence, so it isn't asserted here — see the
    // clamp tests below.
    expect(out[1]).toMatchObject({ kind: "expense", categoryId: "cat-groceries" });
  });

  it("fails loudly when OpenAI is unreachable instead of guessing from keywords", async () => {
    // The old keyword fallback produced plausible-looking categories on every failure, which is
    // how an expired API key went unnoticed across an unknown number of imports.
    categorizeWithOpenAIMock.mockRejectedValue(new Error("401 Incorrect API key provided"));
    await expect(
      categorizeTransactions([{ index: 0, description: "HEMKÖP SUPERMARKET", amount: -200 }]),
    ).rejects.toThrow(/401/);
  });

  it("still resolves rule-matched rows without reaching OpenAI at all", async () => {
    // A total API outage must not block the rows that were never going to need the model.
    categorizeWithOpenAIMock.mockRejectedValue(new Error("down"));
    const out = await categorizeTransactions([{ index: 0, description: "REVOLUT TOPUP", amount: -500 }]);
    expect(out[0]).toMatchObject({ kind: "transfer", confidence: 1 });
  });

  it("nulls out categoryIds that are not valid for the user", async () => {
    categorizeWithOpenAIMock.mockResolvedValue([
      { index: 0, kind: "expense", categoryId: "cat-does-not-exist", confidence: 0.8 },
    ]);
    const out = await categorizeTransactions([{ index: 0, description: "WHATEVER", amount: -100 }]);
    expect(out[0].categoryId).toBeNull();
  });

  it("defaults rows with no rule and no AI result to sign-based kind", async () => {
    categorizeWithOpenAIMock.mockResolvedValue([]); // AI returns nothing for the remaining row
    const out = await categorizeTransactions([{ index: 0, description: "UNMATCHED", amount: -42 }]);
    expect(out[0]).toMatchObject({ kind: "expense", categoryId: null, confidence: 0.4 });
  });

  it("never classifies a negative amount as income, even when the AI says income", async () => {
    categorizeWithOpenAIMock.mockResolvedValue([
      { index: 0, kind: "income", categoryId: null, confidence: 0.9 },
    ]);
    const out = await categorizeTransactions([{ index: 0, description: "MYSTERY SHOP", amount: -742.5 }]);
    expect(out[0].kind).toBe("expense");
  });

  it("never classifies a positive amount as expense, and drops its category", async () => {
    categorizeWithOpenAIMock.mockResolvedValue([
      { index: 0, kind: "expense", categoryId: "cat-groceries", confidence: 0.9 },
    ]);
    const out = await categorizeTransactions([{ index: 0, description: "MYSTERY DEPOSIT", amount: 500 }]);
    expect(out[0]).toMatchObject({ kind: "income", categoryId: null });
  });

  it("leaves a transfer's kind alone regardless of the amount sign", async () => {
    categorizeWithOpenAIMock.mockResolvedValue([
      { index: 0, kind: "transfer", categoryId: null, confidence: 0.9 },
    ]);
    const out = await categorizeTransactions([{ index: 0, description: "MYSTERY MOVE", amount: -1000 }]);
    expect(out[0].kind).toBe("transfer");
  });

  it("applies a matching rule deterministically and skips the LLM, carrying tags", async () => {
    categorizeWithOpenAIMock.mockResolvedValue([]);
    const out = await categorizeTransactions([{ index: 0, description: "ICA Maxi", amount: -200 }]);
    expect(categorizeWithOpenAIMock).not.toHaveBeenCalled();
    expect(out[0]).toMatchObject({ index: 0, kind: "expense", categoryId: "cat-groceries", confidence: 1, tagIds: ["tag-fixed"] });
  });

  it("passes retrieved corpus examples to the model as evidence, resolved to names", async () => {
    retrieveMock.mockResolvedValue(
      new Map([[0, [
        { id: "e1", cleanedDescription: "ICA KVANTUM", finalKind: "expense", finalCategoryId: "cat-groceries", finalTagIds: ["tag-fixed"], approved: true },
        { id: "e2", cleanedDescription: "UNKNOWN CAT", finalKind: "expense", finalCategoryId: "cat-gone", finalTagIds: ["tag-gone"], approved: false },
      ]]]),
    );
    categorizeWithOpenAIMock.mockResolvedValue([]);
    await categorizeTransactions([{ index: 0, description: "MYSTERY", amount: -10 }]);

    const neighbours = categorizeWithOpenAIMock.mock.calls[0][2] as Map<number, unknown[]>;
    expect(neighbours.get(0)).toEqual([
      { id: "e1", description: "ICA KVANTUM", kind: "expense", categoryName: "Groceries", tagNames: ["Fixed cost"], approved: true },
      // Ids the user no longer has resolve to nothing rather than leaking a dangling id.
      { id: "e2", description: "UNKNOWN CAT", kind: "expense", categoryName: null, tagNames: [], approved: false },
    ]);
  });

  it("only sends the model rows that rules did not already resolve", async () => {
    categorizeWithOpenAIMock.mockResolvedValue([]);
    await categorizeTransactions([
      { index: 0, description: "REVOLUT TOPUP", amount: -500 },
      { index: 1, description: "MYSTERY", amount: -10 },
    ]);
    expect(retrieveMock.mock.calls[0][1].map((r: { index: number }) => r.index)).toEqual([1]);
  });

  it("classifies without evidence rather than failing the import when retrieval breaks", async () => {
    retrieveMock.mockRejectedValue(new Error("pgvector down"));
    categorizeWithOpenAIMock.mockResolvedValue([
      { index: 0, kind: "expense", categoryId: "cat-groceries", tagIds: [], confidence: 0.8 },
    ]);
    const out = await categorizeTransactions([{ index: 0, description: "MYSTERY", amount: -10 }]);
    expect(categorizeWithOpenAIMock).toHaveBeenCalledOnce();
    expect(out[0].categoryId).toBe("cat-groceries");
  });

  it("caps confidence for a row retrieval found nothing for, so it lands in review", async () => {
    categorizeWithOpenAIMock.mockResolvedValue([
      { index: 0, kind: "expense", categoryId: "cat-groceries", tagIds: [], confidence: 0.95 },
    ]);
    const out = await categorizeTransactions([{ index: 0, description: "AldrigSedd", amount: -10 }]);
    expect(out[0].confidence).toBeLessThan(0.6);
  });

  it("promotes confidence when a near-identical merchant agrees with the model", async () => {
    retrieveMock.mockResolvedValue(
      new Map([[0, [
        { id: "e1", cleanedDescription: "ICA MAXI HANINGE", finalKind: "expense", finalCategoryId: "cat-groceries", finalTagIds: [], approved: true },
      ]]]),
    );
    categorizeWithOpenAIMock.mockResolvedValue([
      { index: 0, kind: "expense", categoryId: "cat-groceries", tagIds: [], confidence: 0.7 },
    ]);
    const out = await categorizeTransactions([{ index: 0, description: "ICA MAXI HANINGE", amount: -487 }]);
    expect(out[0].confidence).toBeGreaterThanOrEqual(0.95);
  });

  it("keeps the tags a tag-only rule contributes on top of the model's own", async () => {
    categorizeWithOpenAIMock.mockResolvedValue([
      { index: 0, kind: "expense", categoryId: "cat-groceries", tagIds: ["tag-fixed"], confidence: 0.8 },
    ]);
    const out = await categorizeTransactions([{ index: 0, description: "MYSTERY", amount: -10 }]);
    expect(out[0].tagIds).toEqual(["tag-fixed"]);
  });
});
