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
    expect(system).toContain("Here are how the user has categorized similar transactions:");
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
