import { describe, expect, it } from "vitest";
import { recurringKey } from "./normalize";

describe("recurringKey", () => {
  it("collapses the Swedish month suffix banks append to recurring charges", () => {
    // The headline case: rent is described as "HYRA MARS" / "HYRA APRIL" month to month.
    expect(recurringKey("HYRA APRIL")).toBe(recurringKey("HYRA MARS"));
    expect(recurringKey("HYRA APRIL")).toBe("hyra");
  });

  it("collapses abbreviated month names too", () => {
    expect(recurringKey("EL VATTENFALL JAN")).toBe(recurringKey("EL VATTENFALL FEB"));
  });

  it("strips the trailing /yy-mm-dd the CSV parser already knows about", () => {
    expect(recurringKey("SPOTIFY AB /25-03-14")).toBe(recurringKey("SPOTIFY AB"));
  });

  it("drops card and invoice reference numbers (digit runs of 2+)", () => {
    expect(recurringKey("SPOTIFY AB 12345")).toBe(recurringKey("SPOTIFY AB"));
  });

  it("keeps a single digit, which is part of the merchant name", () => {
    expect(recurringKey("OKQ8 STOCKHOLM")).toBe("okq8 stockholm");
  });

  it("drops Swedish bank noise prefixes", () => {
    expect(recurringKey("AUTOGIRO HYRA")).toBe(recurringKey("HYRA"));
    expect(recurringKey("KORTKÖP SPOTIFY")).toBe(recurringKey("SPOTIFY"));
  });

  it("keeps only the first three tokens, since the variable part trails", () => {
    expect(recurringKey("ALPHA BETA GAMMA DELTA EPSILON")).toBe("alpha beta gamma");
  });

  it("keeps genuinely different merchants apart", () => {
    expect(recurringKey("ICA MAXI HANINGE")).not.toBe(recurringKey("COOP FORUM"));
  });

  it("survives a description that normalises to nothing", () => {
    expect(recurringKey("  12345  ")).toBe("");
  });
});
