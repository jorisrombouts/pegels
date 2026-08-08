import { describe, expect, it } from "vitest";
import { RRF_K, diversify, rrf, sameMagnitude } from "./fuse";

describe("rrf", () => {
  it("ranks an id that both arms agree on above one only a single arm found", () => {
    const out = rrf([
      { weight: 1, ids: ["both", "vecOnly"] },
      { weight: 1, ids: ["both", "lexOnly"] },
    ]);
    expect(out[0].id).toBe("both");
  });

  it("scores by summed reciprocal rank", () => {
    const out = rrf([{ weight: 1, ids: ["a", "b"] }]);
    expect(out.find((r) => r.id === "a")!.score).toBeCloseTo(1 / (RRF_K + 0));
    expect(out.find((r) => r.id === "b")!.score).toBeCloseTo(1 / (RRF_K + 1));
  });

  it("respects arm weights", () => {
    const heavy = rrf([
      { weight: 10, ids: ["x"] },
      { weight: 1, ids: ["y"] },
    ]);
    expect(heavy[0].id).toBe("x");
  });

  it("keeps an id that only one arm returned", () => {
    const out = rrf([
      { weight: 1, ids: ["a"] },
      { weight: 1, ids: ["b"] },
    ]);
    expect(out.map((r) => r.id).sort()).toEqual(["a", "b"]);
  });

  it("returns nothing for empty input", () => {
    expect(rrf([])).toEqual([]);
    expect(rrf([{ weight: 1, ids: [] }])).toEqual([]);
  });
});

describe("diversify", () => {
  const item = (id: string, group: string) => ({ id, group });

  it("keeps at most one entry per group so one merchant can't fill every slot", () => {
    const out = diversify(
      [item("a1", "ica"), item("a2", "ica"), item("b1", "coop"), item("c1", "hyra")],
      (i) => i.group,
      3,
    );
    expect(out.map((i) => i.id)).toEqual(["a1", "b1", "c1"]);
  });

  it("preserves the incoming rank order", () => {
    const out = diversify([item("z", "g1"), item("y", "g2")], (i) => i.group, 5);
    expect(out.map((i) => i.id)).toEqual(["z", "y"]);
  });

  it("caps at the limit", () => {
    const out = diversify([item("a", "1"), item("b", "2"), item("c", "3")], (i) => i.group, 2);
    expect(out).toHaveLength(2);
  });

  it("returns fewer than the limit when there aren't enough distinct groups", () => {
    const out = diversify([item("a", "ica"), item("b", "ica")], (i) => i.group, 5);
    expect(out.map((i) => i.id)).toEqual(["a"]);
  });
});

describe("sameMagnitude", () => {
  it("treats amounts within about 3x as the same order of magnitude", () => {
    expect(sameMagnitude(-487, -500)).toBe(true);
    expect(sameMagnitude(-487, -1000)).toBe(true);
  });

  it("separates a grocery run from a rent payment", () => {
    expect(sameMagnitude(-487, -12500)).toBe(false);
  });

  it("ignores sign, comparing magnitude only", () => {
    expect(sameMagnitude(-487, 500)).toBe(true);
  });

  it("is false rather than exploding when either amount is zero", () => {
    expect(sameMagnitude(0, -500)).toBe(false);
    expect(sameMagnitude(-500, 0)).toBe(false);
  });
});
