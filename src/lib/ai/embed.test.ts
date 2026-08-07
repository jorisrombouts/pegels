import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();

vi.mock("openai", () => ({
  default: class {
    embeddings = { create: createMock };
  },
}));

import { EMBED_CHUNK, embedMany } from "./embed";

/** A response echoing one vector per input, in the shuffled order the API is free to use. */
function respondShuffled(input: string[]) {
  const data = input.map((_, i) => ({ index: i, embedding: [i, 0, 0] }));
  return { data: [...data].reverse() };
}

beforeEach(() => {
  createMock.mockReset();
  createMock.mockImplementation(({ input }: { input: string[] }) => respondShuffled(input));
});

describe("embedMany", () => {
  it("returns one vector per input, aligned to the input order", async () => {
    const out = await embedMany(["ica maxi", "spotify", "hyra"]);
    expect(out).toEqual([[0, 0, 0], [1, 0, 0], [2, 0, 0]]);
  });

  it("realigns a response the API returned out of order", async () => {
    // The mock deliberately reverses `data`; the `index` field is what makes this safe.
    const out = await embedMany(["a", "b"]);
    expect(out[0]).toEqual([0, 0, 0]);
    expect(out[1]).toEqual([1, 0, 0]);
  });

  it("makes no API call for an empty list", async () => {
    expect(await embedMany([])).toEqual([]);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("never sends an empty string, and reports it as no embedding", async () => {
    // normalizeMerchant can legitimately return "" — the API rejects that.
    const out = await embedMany(["", "spotify", ""]);
    expect(out[0]).toBeNull();
    expect(out[2]).toBeNull();
    expect(out[1]).not.toBeNull();
    expect(createMock.mock.calls[0][0].input).toEqual(["spotify"]);
  });

  it("chunks large batches", async () => {
    await embedMany(Array.from({ length: EMBED_CHUNK + 5 }, (_, i) => `m${i}`));
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(createMock.mock.calls[0][0].input).toHaveLength(EMBED_CHUNK);
    expect(createMock.mock.calls[1][0].input).toHaveLength(5);
  });

  it("never throws — a failed chunk yields nulls only for its own slice", async () => {
    createMock.mockImplementationOnce(() => Promise.reject(new Error("rate limited")));
    const texts = Array.from({ length: EMBED_CHUNK + 3 }, (_, i) => `m${i}`);
    const out = await embedMany(texts);

    expect(out).toHaveLength(texts.length);
    expect(out.slice(0, EMBED_CHUNK).every((v) => v === null)).toBe(true);
    expect(out.slice(EMBED_CHUNK).every((v) => v !== null)).toBe(true);
  });

  it("survives the API failing outright", async () => {
    createMock.mockImplementation(() => Promise.reject(new Error("down")));
    await expect(embedMany(["a", "b"])).resolves.toEqual([null, null]);
  });

  it("survives a proxy answering 200 with something that isn't an embedding response", async () => {
    // A captive portal or filtering gateway returns an HTML block page with a 200, so the SDK
    // resolves rather than throwing and hands back a string. Assuming res.data is iterable turns
    // that into a TypeError that escapes — breaking the never-throws contract this relies on.
    createMock.mockImplementation(() => Promise.resolve("<!DOCTYPE html><html>Blocked</html>"));
    await expect(embedMany(["a", "b"])).resolves.toEqual([null, null]);
  });

  it("survives a response whose data array is missing", async () => {
    createMock.mockImplementation(() => Promise.resolve({ object: "list" }));
    await expect(embedMany(["a"])).resolves.toEqual([null]);
  });

  it("ignores an item whose embedding isn't a vector", async () => {
    createMock.mockImplementation(() => Promise.resolve({ data: [{ index: 0, embedding: "not-a-vector" }] }));
    await expect(embedMany(["a"])).resolves.toEqual([null]);
  });
});
