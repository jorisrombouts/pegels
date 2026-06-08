import { describe, expect, it, vi } from "vitest";

const createMock = vi.fn();

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: createMock } };
  },
}));

import { buildMessages, categorizeWithOpenAI } from "./categorize-openai";

const categories = [
  { id: "cat-groceries", name: "Groceries" },
  { id: "cat-transit", name: "Transit" },
];

describe("buildMessages", () => {
  it("includes the category names", () => {
    const messages = buildMessages([{ index: 0, description: "ICA", amount: -100 }], categories, []);
    const system = messages[0].content;
    expect(system).toContain("cat-groceries = Groceries");
    expect(system).toContain("cat-transit = Transit");
  });

  it("includes few-shot examples when provided", () => {
    const messages = buildMessages(
      [{ index: 0, description: "ICA", amount: -100 }],
      categories,
      [{ description: "Coop Stockholm", kind: "expense", categoryName: "Groceries" }],
    );
    const system = messages[0].content;
    expect(system).toContain("The user has explicitly corrected these categorizations — prefer them");
    expect(system).toContain("Coop Stockholm");
    expect(system).toContain("Groceries");
  });

  it("lists rows as index | amount | description in the user message", () => {
    const messages = buildMessages([{ index: 2, description: "SL", amount: -43 }], categories, []);
    expect(messages[1].content).toContain("2 | -43 | SL");
  });
});

describe("categorizeWithOpenAI", () => {
  it("maps the parsed JSON to AiResult[]", async () => {
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              results: [
                { index: 0, kind: "expense", categoryId: "cat-groceries", confidence: 0.9 },
                { index: 1, kind: "income", categoryId: null, confidence: 1.5 },
              ],
            }),
          },
        },
      ],
    });

    const results = await categorizeWithOpenAI(
      [
        { index: 0, description: "ICA", amount: -100 },
        { index: 1, description: "LÖN", amount: 42500 },
      ],
      categories,
    );

    expect(results).toEqual([
      { index: 0, kind: "expense", categoryId: "cat-groceries", confidence: 0.9 },
      { index: 1, kind: "income", categoryId: null, confidence: 1 },
    ]);
  });

  it("chunks > CHUNK_SIZE rows into parallel calls and merges every index once", async () => {
    createMock.mockReset();
    // Echo back one result per index found in this call's user message.
    createMock.mockImplementation(
      async (params: { messages: { role: string; content: string }[] }) => {
        const userMsg = params.messages.find((m) => m.role === "user")!.content;
        const indices = userMsg
          .split("\n")
          .map((line) => line.match(/^(\d+) \|/))
          .filter((m): m is RegExpMatchArray => m !== null)
          .map((m) => Number(m[1]));
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  results: indices.map((index) => ({
                    index,
                    kind: "expense",
                    categoryId: "cat-groceries",
                    confidence: 0.5,
                  })),
                }),
              },
            },
          ],
        };
      },
    );

    const rows = Array.from({ length: 90 }, (_, i) => ({
      index: i,
      description: `ROW ${i}`,
      amount: -i,
    }));

    const results = await categorizeWithOpenAI(rows, categories);

    expect(createMock).toHaveBeenCalledTimes(3); // 90 / 40 → 3 chunks
    const returnedIndices = results.map((r) => r.index).sort((a, b) => a - b);
    expect(returnedIndices).toEqual(Array.from({ length: 90 }, (_, i) => i));
    // no duplicates
    expect(new Set(returnedIndices).size).toBe(90);
    createMock.mockReset();
  });

  it("nulls out a categoryId that isn't in the provided list", async () => {
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              results: [{ index: 0, kind: "expense", categoryId: "cat-unknown", confidence: 0.7 }],
            }),
          },
        },
      ],
    });

    const results = await categorizeWithOpenAI([{ index: 0, description: "X", amount: -1 }], categories);
    expect(results[0].categoryId).toBeNull();
  });
});
