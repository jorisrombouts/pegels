import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithData } from "@/test/render";
import { useUI } from "@/store/ui";
import TransactionsPage from "./page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

describe("TransactionsPage", () => {
  it("shows income (salary) rows in the activity list with the amount masked", () => {
    // The page renders in isolation here (no MonthInitializer), so pin the month to the seed's month.
    useUI.setState({ month: "2025-03" });
    renderWithData(<TransactionsPage />);
    expect(screen.getByText("Lön Företaget AB")).toBeInTheDocument();
    expect(screen.queryByText(/38\s?500/)).not.toBeInTheDocument();
  });
});
