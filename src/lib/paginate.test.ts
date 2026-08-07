import { describe, expect, it } from "vitest";
import { paginate } from "./paginate";

const items = Array.from({ length: 53 }, (_, i) => i);

describe("paginate", () => {
  it("returns the first page and reports the range in human terms", () => {
    const p = paginate(items, 0, 25);
    expect(p.rows).toHaveLength(25);
    expect(p.rows[0]).toBe(0);
    expect(p).toMatchObject({ page: 0, pageCount: 3, from: 1, to: 25, total: 53 });
  });

  it("returns a middle page", () => {
    const p = paginate(items, 1, 25);
    expect(p.rows[0]).toBe(25);
    expect(p).toMatchObject({ from: 26, to: 50 });
  });

  it("returns a short final page", () => {
    const p = paginate(items, 2, 25);
    expect(p.rows).toHaveLength(3);
    expect(p).toMatchObject({ from: 51, to: 53 });
  });

  it("clamps a page past the end back onto the last one", () => {
    // The queue shrinks as rows are approved, so the page you're on can stop existing.
    const p = paginate(items, 99, 25);
    expect(p.page).toBe(2);
    expect(p.rows).toHaveLength(3);
  });

  it("clamps a negative page to the first", () => {
    expect(paginate(items, -3, 25).page).toBe(0);
  });

  it("reports one empty page for an empty list rather than zero pages", () => {
    const p = paginate([], 0, 25);
    expect(p).toMatchObject({ rows: [], page: 0, pageCount: 1, from: 0, to: 0, total: 0 });
  });

  it("fits a list shorter than one page on a single page", () => {
    const p = paginate([1, 2, 3], 0, 25);
    expect(p).toMatchObject({ pageCount: 1, from: 1, to: 3 });
  });

  it("handles an exact multiple without inventing a trailing empty page", () => {
    expect(paginate(Array.from({ length: 50 }, (_, i) => i), 0, 25).pageCount).toBe(2);
  });
});
