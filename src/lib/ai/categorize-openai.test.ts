import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: createMock } };
  },
}));

import { buildMessages, categorizeWithOpenAI, type AiNeighbour, type PromptTaxonomy } from "./categorize-openai";

const taxonomy: PromptTaxonomy = {
  categories: [
    { id: "cat-groceries", name: "Groceries" },
    { id: "cat-transit", name: "Transit" },
  ],
  tags: [
    { id: "tag-fixed", name: "Fixed cost" },
    { id: "tag-sub", name: "Subscription" },
  ],
};

const neighbour = (id: string, description: string, o: Partial<AiNeighbour> = {}): AiNeighbour => ({
  id,
  description,
  kind: "expense",
  categoryName: "Groceries",
  tagNames: [],
  approved: true,
  ...o,
});

const row = (index: number, description: string, amount = -100) => ({ index, description, amount });

beforeEach(() => {
  createMock.mockReset();
  createMock.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ results: [] }) } }] });
});

describe("buildMessages — the cached prefix", () => {
  it("keeps the system message byte-identical across different retrieved neighbours", () => {
    // OpenAI prompt caching is an exact-prefix match. If retrieval leaks into the system message
    // the cache misses on every call, and the cost is invisible until the bill arrives.
    const a = buildMessages([row(0, "ICA")], taxonomy, new Map([[0, [neighbour("E1", "ica maxi")]]]));
    const b = buildMessages([row(0, "ICA")], taxonomy, new Map([[0, [neighbour("E9", "coop forum")]]]));
    expect(a[0].content).toBe(b[0].content);
  });

  it("keeps the system message identical across entirely different row batches", () => {
    const a = buildMessages([row(0, "ICA")], taxonomy, new Map());
    const b = buildMessages([row(0, "SPOTIFY"), row(1, "SL")], taxonomy, new Map());
    expect(a[0].content).toBe(b[0].content);
  });

  it("changes the system message when the taxonomy changes", () => {
    const extra: PromptTaxonomy = { ...taxonomy, categories: [...taxonomy.categories, { id: "cat-x", name: "X" }] };
    expect(buildMessages([row(0, "ICA")], taxonomy, new Map())[0].content).not.toBe(
      buildMessages([row(0, "ICA")], extra, new Map())[0].content,
    );
  });

  it("lists both taxonomies so the model can only pick real ids", () => {
    const system = buildMessages([row(0, "ICA")], taxonomy, new Map())[0].content;
    expect(system).toContain("cat-groceries = Groceries");
    expect(system).toContain("tag-fixed = Fixed cost");
  });

  it("carries the domain priors that replaced the deleted rules", () => {
    const system = buildMessages([row(0, "ICA")], taxonomy, new Map())[0].content;
    expect(system).toMatch(/LÖN/);
    expect(system).toMatch(/Amex|American Express/);
    expect(system).toMatch(/ICA/);
    // The priors must lose to real evidence, or they are rules by another name.
    expect(system).toMatch(/confirmed example/i);
  });

  it("grounds the model in where these transactions come from", () => {
    // Without this the model has to infer the country from merchant names alone.
    const system = buildMessages([row(0, "ICA")], taxonomy, new Map())[0].content;
    expect(system).toMatch(/Swed/i);
    expect(system).toMatch(/Stockholm/);
    expect(system).toMatch(/SEK|kronor/i);
  });

  it("expands Swedish abbreviations rather than just asserting a category", () => {
    // "SL" is meaningless on its own; the expansion is what lets the model generalise to
    // SL Månadskort, SL Access, SL Reskassa without each being listed.
    const system = buildMessages([row(0, "SL")], taxonomy, new Map())[0].content;
    expect(system).toMatch(/Storstockholms Lokaltrafik/i);
  });

  it("warns that bank descriptions arrive truncated", () => {
    // Real corpus entries include "ica supermar" and "apple com/bi" — cut mid-word by the bank.
    const system = buildMessages([row(0, "ICA SUPERMAR")], taxonomy, new Map())[0].content;
    expect(system).toMatch(/truncat/i);
  });

  it("explains the payment intermediaries that hide the real merchant", () => {
    const system = buildMessages([row(0, "SWISH")], taxonomy, new Map())[0].content;
    expect(system).toMatch(/Swish/i);
    expect(system).toMatch(/Klarna/i);
    expect(system).toMatch(/Zettle/i);
  });

  it("covers the merchants that actually appear in Swedish statements", () => {
    const system = buildMessages([row(0, "X")], taxonomy, new Map())[0].content;
    for (const m of ["Willys", "Systembolaget", "Apoteket", "Pressbyrån", "Espresso House", "Telia", "Vattenfall", "Clas Ohlson"]) {
      expect(system, `missing prior for ${m}`).toContain(m);
    }
  });
});

describe("buildMessages — the evidence table", () => {
  it("lists each retrieved example once and points rows at it by id", () => {
    const shared = neighbour("x", "ica maxi haninge");
    const user = buildMessages(
      [row(0, "ICA NÄRA"), row(1, "ICA MAXI")],
      taxonomy,
      new Map([[0, [shared]], [1, [shared]]]),
    )[1].content;
    // Deduplicated: one evidence line for the merchant both rows matched.
    expect(user.match(/ica maxi haninge/g)).toHaveLength(1);
    expect(user).toMatch(/^0 \|.*\| E1$/m);
    expect(user).toMatch(/^1 \|.*\| E1$/m);
  });

  it("renders a neighbour's kind, category and tags", () => {
    const user = buildMessages(
      [row(0, "SPOTIFY")],
      taxonomy,
      new Map([[0, [neighbour("n", "spotify ab", { categoryName: "Entertainment", tagNames: ["Subscription"] })]]]),
    )[1].content;
    expect(user).toContain("spotify ab");
    expect(user).toContain("Entertainment");
    expect(user).toContain("Subscription");
  });

  it("separates unreviewed candidates so they read as weaker evidence", () => {
    const user = buildMessages(
      [row(0, "ICA")],
      taxonomy,
      new Map([[0, [neighbour("a", "approved one"), neighbour("b", "candidate one", { approved: false })]]]),
    )[1].content;
    expect(user).toMatch(/CONFIRMED EXAMPLES/);
    expect(user).toMatch(/UNCONFIRMED EXAMPLES/);
    expect(user.indexOf("approved one")).toBeLessThan(user.indexOf("UNCONFIRMED"));
  });

  it("omits the evidence section entirely when nothing was retrieved", () => {
    const user = buildMessages([row(0, "ICA")], taxonomy, new Map())[1].content;
    expect(user).not.toMatch(/CONFIRMED EXAMPLES/);
    expect(user).toContain("ICA");
  });

  it("still lists a row that matched nothing", () => {
    const user = buildMessages(
      [row(0, "ICA"), row(1, "OKÄND")],
      taxonomy,
      new Map([[0, [neighbour("a", "ica maxi")]]]),
    )[1].content;
    expect(user).toMatch(/^1 \|.*OKÄND/m);
  });

  it("lists rows as index | amount | description", () => {
    const user = buildMessages([{ index: 2, description: "SL", amount: -43 }], taxonomy, new Map())[1].content;
    expect(user).toContain("2 | -43 | SL");
  });
});

describe("categorizeWithOpenAI", () => {
  it("asks for deterministic output — sampling makes a settled merchant flip month to month", async () => {
    await categorizeWithOpenAI([row(0, "ICA")], taxonomy, new Map());
    expect(createMock.mock.calls[0][0].temperature).toBe(0);
  });

  it("requests tagIds in the structured output", async () => {
    await categorizeWithOpenAI([row(0, "ICA")], taxonomy, new Map());
    const schema = createMock.mock.calls[0][0].response_format.json_schema.schema;
    expect(schema.properties.results.items.required).toContain("tagIds");
  });

  it("maps the parsed JSON to AiResult[]", async () => {
    createMock.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            results: [
              { index: 0, kind: "expense", categoryId: "cat-groceries", tagIds: ["tag-fixed"], confidence: 0.9 },
              { index: 1, kind: "income", categoryId: null, tagIds: [], confidence: 1.5 },
            ],
          }),
        },
      }],
    });
    const results = await categorizeWithOpenAI(
      [row(0, "ICA"), row(1, "LÖN", 42500)],
      taxonomy,
      new Map(),
    );
    // `level` is provisional here — the action grades it against retrieval evidence.
    expect(results).toEqual([
      { index: 0, kind: "expense", categoryId: "cat-groceries", tagIds: ["tag-fixed"], confidence: 0.9, level: "medium" },
      { index: 1, kind: "income", categoryId: null, tagIds: [], confidence: 1, level: "medium" },
    ]);
  });

  it("drops hallucinated category and tag ids", async () => {
    createMock.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            results: [{ index: 0, kind: "expense", categoryId: "cat-nope", tagIds: ["tag-fixed", "tag-nope"], confidence: 0.9 }],
          }),
        },
      }],
    });
    const [res] = await categorizeWithOpenAI([row(0, "ICA")], taxonomy, new Map());
    expect(res.categoryId).toBeNull();
    expect(res.tagIds).toEqual(["tag-fixed"]);
  });

  it("tolerates a response that omits tagIds entirely", async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ results: [{ index: 0, kind: "expense", categoryId: null, confidence: 0.5 }] }) } }],
    });
    const [res] = await categorizeWithOpenAI([row(0, "ICA")], taxonomy, new Map());
    expect(res.tagIds).toEqual([]);
  });

  it("chunks large batches into parallel calls and merges every index once", async () => {
    createMock.mockImplementation(async (params: { messages: { role: string; content: string }[] }) => {
      const userMsg = params.messages.find((m) => m.role === "user")!.content;
      const indices = userMsg
        .split("\n")
        .map((line) => line.match(/^(\d+) \|/))
        .filter((m): m is RegExpMatchArray => m !== null)
        .map((m) => Number(m[1]));
      return {
        choices: [{
          message: {
            content: JSON.stringify({
              results: indices.map((index) => ({ index, kind: "expense", categoryId: "cat-groceries", tagIds: [], confidence: 0.5 })),
            }),
          },
        }],
      };
    });

    const rows = Array.from({ length: 90 }, (_, i) => row(i, `ROW ${i}`, -i));
    const results = await categorizeWithOpenAI(rows, taxonomy, new Map());

    expect(createMock).toHaveBeenCalledTimes(3); // 90 / 40 → 3 chunks
    const returned = results.map((r) => r.index).sort((a, b) => a - b);
    expect(returned).toEqual(Array.from({ length: 90 }, (_, i) => i));
    expect(new Set(returned).size).toBe(90);
  });

  it("throws only when every chunk fails", async () => {
    createMock.mockRejectedValue(new Error("down"));
    await expect(categorizeWithOpenAI([row(0, "ICA")], taxonomy, new Map())).rejects.toThrow();
  });
});
