import { describe, expect, it } from "vitest";
import { useUI } from "./ui";
import { monthKey } from "@/lib/format";

describe("default month", () => {
  it("defaults to the current month, not a hardcoded mock month", () => {
    expect(useUI.getState().month).toBe(monthKey(new Date()));
  });
});
