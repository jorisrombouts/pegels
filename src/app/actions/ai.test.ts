import { describe, expect, it, vi, beforeEach } from "vitest";

const { getDatasetMock, categorizeWithOpenAIMock } = vi.hoisted(() => ({
  getDatasetMock: vi.fn(),
  categorizeWithOpenAIMock: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({ getDataset: getDatasetMock }));
vi.mock("@/lib/ai/categorize-openai", () => ({ categorizeWithOpenAIMock, categorizeWithOpenAI: categorizeWithOpenAIMock }));

import { categorizeTransactions } from "./ai";

beforeEach(() => {
  getDatasetMock.mockReset();
  categorizeWithOpenAIMock.mockReset();
  getDatasetMock.mockResolvedValue({
    categories: [
      { id: "cat-groceries", name: "Groceries" },
      { id: "cat-mortgage", name: "Mortgage" },
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

  it("merges OpenAI results for non-ruled rows", async () => {
    categorizeWithOpenAIMock.mockResolvedValue([
      { index: 1, kind: "expense", categoryId: "cat-groceries", confidence: 0.9 },
    ]);
    const out = await categorizeTransactions([
      { index: 0, description: "AVANZA", amount: -1000 },
      { index: 1, description: "ICA KVANTUM", amount: -350 },
    ]);
    expect(categorizeWithOpenAIMock).toHaveBeenCalledOnce();
    expect(out[0]).toMatchObject({ kind: "transfer", categoryId: null }); // rule
    expect(out[1]).toMatchObject({ kind: "expense", categoryId: "cat-groceries", confidence: 0.9 });
  });

  it("falls back to keyword categorize when OpenAI throws", async () => {
    categorizeWithOpenAIMock.mockRejectedValue(new Error("no key"));
    const out = await categorizeTransactions([
      { index: 0, description: "ICA SUPERMARKET", amount: -200 },
      { index: 1, description: "MYSTERY DEPOSIT", amount: 500 },
    ]);
    expect(out[0]).toMatchObject({ kind: "expense", categoryId: "cat-groceries" });
    expect(out[1]).toMatchObject({ kind: "income" }); // positive amount → income
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
});
