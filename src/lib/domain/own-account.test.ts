import { describe, expect, it } from "vitest";
import { matchesOwnAccount } from "./own-account";

describe("matchesOwnAccount", () => {
  it("matches a description referencing an own account number, ignoring spaces", () => {
    expect(matchesOwnAccount("Överföring 99887766554", ["99887766554"])).toBe(true);
    expect(matchesOwnAccount("Insättning 9988 7766554", ["99887766554"])).toBe(true);
    expect(matchesOwnAccount("Från 99887766554", ["9988 7766554"])).toBe(true);
  });

  it("does not match unrelated descriptions or empty number lists", () => {
    expect(matchesOwnAccount("ICA SUPERMARKET", ["99887766554"])).toBe(false);
    expect(matchesOwnAccount("Överföring 99887766554", [])).toBe(false);
    expect(matchesOwnAccount("Överföring 99887766554", [""])).toBe(false);
  });
});
