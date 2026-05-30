import { describe, expect, it } from "vitest";
import { formatSEK, formatSEKAbs, parseKronor } from "./format";

describe("formatSEK", () => {
  it("renders 2 decimals with a comma", () => {
    const s = formatSEK(100.75);
    expect(s).toContain("100,75");
    expect(s).toContain("kr");
  });

  it("renders space thousands separator and 2 decimals", () => {
    const s = formatSEK(12345.67);
    expect(s).toContain("12");
    expect(s).toContain("345,67");
    expect(s).toContain("kr");
  });

  it("renders negatives with a minus and 2 decimals", () => {
    const s = formatSEK(-487);
    expect(s).toContain("487,00");
    expect(s).toMatch(/[-−]/);
  });

  it("returns the mask when masked", () => {
    expect(formatSEK(0, true)).toBe("•••• kr");
  });
});

describe("formatSEKAbs", () => {
  it("drops the sign and keeps 2 decimals", () => {
    const s = formatSEKAbs(-487);
    expect(s).toContain("487,00");
    expect(s).not.toMatch(/[-−]/);
  });
});

describe("parseKronor", () => {
  it("parses comma decimals", () => {
    expect(parseKronor("100,75")).toBe(100.75);
  });
  it("parses dot decimals", () => {
    expect(parseKronor("100.75")).toBe(100.75);
  });
  it("parses space thousands", () => {
    expect(parseKronor("1 200")).toBe(1200);
  });
  it("strips the kr suffix", () => {
    expect(parseKronor("75 kr")).toBe(75);
  });
  it("returns 0 for non-numeric input", () => {
    expect(parseKronor("x")).toBe(0);
  });
});
