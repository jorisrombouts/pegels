import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithData } from "@/test/render";
import { seedDataset } from "@/data/mock";
import { useUI } from "@/store/ui";
import { MonthInitializer } from "./month-initializer";

describe("MonthInitializer", () => {
  it("jumps to the latest month that has data on load", async () => {
    useUI.setState({ month: "2025-03" });
    const dataset = {
      ...seedDataset,
      transactions: [{ ...seedDataset.transactions[0], id: "t-new", date: "2026-05-12" }],
    };
    renderWithData(<MonthInitializer />, { dataset });
    await waitFor(() => expect(useUI.getState().month).toBe("2026-05"));
  });
});
