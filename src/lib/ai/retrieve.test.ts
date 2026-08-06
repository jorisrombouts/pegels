import { beforeEach, describe, expect, it, vi } from "vitest";

const loadCorpus = vi.fn();
const nearestByVector = vi.fn();
const unembeddedRows = vi.fn();
const saveEmbeddings = vi.fn();
const countApproved = vi.fn();
const embedMany = vi.fn();

vi.mock("@/lib/db/corpus-queries", () => ({
  loadCorpus: (...a: unknown[]) => loadCorpus(...a),
  nearestByVector: (...a: unknown[]) => nearestByVector(...a),
  unembeddedRows: (...a: unknown[]) => unembeddedRows(...a),
  saveEmbeddings: (...a: unknown[]) => saveEmbeddings(...a),
  countApproved: (...a: unknown[]) => countApproved(...a),
  MIN_APPROVED_FOR_STRICT: 50,
  VECTOR_K: 8,
}));
vi.mock("./embed", () => ({
  embedMany: (...a: unknown[]) => embedMany(...a),
  EMBED_MODEL: "text-embedding-3-small",
}));

import { retrieveNeighbours } from "./retrieve";

const corpusRow = (id: string, description: string, o: Record<string, unknown> = {}) => ({
  id,
  dedupKey: description.toLowerCase(),
  cleanedDescription: description,
  amount: -500,
  finalKind: "expense",
  finalCategoryId: "cat-groceries",
  finalTagIds: [],
  hitCount: 1,
  lastSeenAt: "2025-03-01",
  ...o,
});

beforeEach(() => {
  for (const m of [loadCorpus, nearestByVector, unembeddedRows, saveEmbeddings, countApproved, embedMany]) m.mockReset();
  countApproved.mockResolvedValue(100);
  unembeddedRows.mockResolvedValue([]);
  nearestByVector.mockResolvedValue([]);
  embedMany.mockImplementation((texts: string[]) => texts.map((_, i) => [i, 0, 0]));
  loadCorpus.mockResolvedValue([]);
});

describe("retrieveNeighbours", () => {
  it("finds a corpus row by shared merchant tokens with no vectors at all", async () => {
    // The lexical arm must stand alone — an embeddings outage degrades quality, not availability.
    loadCorpus.mockResolvedValue([corpusRow("e1", "ICA MAXI HANINGE"), corpusRow("e2", "SPOTIFY AB")]);
    embedMany.mockResolvedValue([null]);

    const out = await retrieveNeighbours("u1", [{ index: 0, description: "ICA MAXI VASASTAN", amount: -487 }]);
    expect(out.get(0)!.map((n) => n.id)).toContain("e1");
    expect(out.get(0)!.map((n) => n.id)).not.toContain("e2");
  });

  it("never asks the database for vectors when no query embedded", async () => {
    loadCorpus.mockResolvedValue([corpusRow("e1", "ICA MAXI")]);
    embedMany.mockResolvedValue([null]);
    await retrieveNeighbours("u1", [{ index: 0, description: "ICA MAXI", amount: -487 }]);
    expect(nearestByVector).not.toHaveBeenCalled();
  });

  it("embeds each distinct merchant once, however many rows share it", async () => {
    loadCorpus.mockResolvedValue([corpusRow("e1", "ICA MAXI")]);
    await retrieveNeighbours("u1", [
      { index: 0, description: "ICA MAXI 111", amount: -100 },
      { index: 1, description: "ICA MAXI 222", amount: -200 },
      { index: 2, description: "SPOTIFY AB", amount: -139 },
    ]);
    expect(embedMany).toHaveBeenCalledTimes(1);
    expect(embedMany.mock.calls[0][0]).toHaveLength(2); // "ica maxi" and "spotify ab"
  });

  it("fans one merchant's neighbours back to every row that shares it", async () => {
    loadCorpus.mockResolvedValue([corpusRow("e1", "ICA MAXI")]);
    nearestByVector.mockResolvedValue([{ queryIndex: 0, id: "e1", similarity: 0.9 }]);
    const out = await retrieveNeighbours("u1", [
      { index: 0, description: "ICA MAXI 111", amount: -100 },
      { index: 7, description: "ICA MAXI 222", amount: -200 },
    ]);
    expect(out.get(0)!.map((n) => n.id)).toEqual(["e1"]);
    expect(out.get(7)!.map((n) => n.id)).toEqual(["e1"]);
  });

  it("merges both arms, ranking a row they agree on first", async () => {
    loadCorpus.mockResolvedValue([
      corpusRow("agreed", "ICA MAXI HANINGE"),
      corpusRow("vecOnly", "HELT ANNAT STÄLLE"),
    ]);
    nearestByVector.mockResolvedValue([
      { queryIndex: 0, id: "agreed", similarity: 0.95 },
      { queryIndex: 0, id: "vecOnly", similarity: 0.9 },
    ]);
    const out = await retrieveNeighbours("u1", [{ index: 0, description: "ICA MAXI VASASTAN", amount: -487 }]);
    expect(out.get(0)![0].id).toBe("agreed");
  });

  it("caps neighbours per row and never repeats one merchant", async () => {
    loadCorpus.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => corpusRow(`ica${i}`, "ICA MAXI HANINGE", { dedupKey: "ica maxi haninge" })),
    );
    const out = await retrieveNeighbours("u1", [{ index: 0, description: "ICA MAXI", amount: -487 }], { limit: 6 });
    expect(out.get(0)!).toHaveLength(1); // all twelve share one dedupKey
  });

  it("returns an empty list for a row nothing matches", async () => {
    loadCorpus.mockResolvedValue([corpusRow("e1", "ICA MAXI")]);
    const out = await retrieveNeighbours("u1", [{ index: 0, description: "OKÄND BUTIK", amount: -50 }]);
    expect(out.get(0)).toEqual([]);
  });

  it("widens to unreviewed candidates while the approved corpus is thin", async () => {
    countApproved.mockResolvedValue(3);
    await retrieveNeighbours("u1", [{ index: 0, description: "ICA", amount: -100 }]);
    expect(loadCorpus.mock.calls[0][1]).toMatchObject({ includeCandidates: true });
  });

  it("trusts only approved examples once the corpus is established", async () => {
    countApproved.mockResolvedValue(200);
    await retrieveNeighbours("u1", [{ index: 0, description: "ICA", amount: -100 }]);
    expect(loadCorpus.mock.calls[0][1]).toMatchObject({ includeCandidates: false });
  });

  it("back-fills missing embeddings before searching, without blocking on failure", async () => {
    unembeddedRows.mockResolvedValue([{ id: "e9", cleanedDescription: "NYTT STÄLLE" }]);
    embedMany.mockResolvedValue([[1, 2, 3]]);
    loadCorpus.mockResolvedValue([corpusRow("e9", "NYTT STÄLLE")]);
    await retrieveNeighbours("u1", [{ index: 0, description: "NYTT STÄLLE", amount: -100 }]);
    expect(saveEmbeddings).toHaveBeenCalledWith([{ id: "e9", embedding: [1, 2, 3], model: "text-embedding-3-small" }]);
  });

  it("does not fall over when the whole corpus is empty", async () => {
    const out = await retrieveNeighbours("u1", [{ index: 0, description: "ICA", amount: -100 }]);
    expect(out.get(0)).toEqual([]);
    expect(nearestByVector).not.toHaveBeenCalled();
  });
});
