import { describe, expect, it } from "vitest";
import { shouldSave, type UserPrefs } from "./preferences";

const base: UserPrefs = {
  layout: [{ id: "total", size: "large" }],
  navConfig: [{ key: "home", primary: true }],
};

describe("shouldSave", () => {
  it("saves when there is no previous value", () => {
    expect(shouldSave(null, base)).toBe(true);
  });
  it("does not save an identical value", () => {
    expect(shouldSave({ ...base }, { ...base })).toBe(false);
  });
  it("saves when the layout changed", () => {
    const next: UserPrefs = { ...base, layout: [{ id: "total", size: "medium" }] };
    expect(shouldSave(base, next)).toBe(true);
  });
  it("saves when the nav config changed", () => {
    const next: UserPrefs = { ...base, navConfig: [{ key: "home", primary: false }] };
    expect(shouldSave(base, next)).toBe(true);
  });
});
