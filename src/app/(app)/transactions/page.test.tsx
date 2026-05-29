import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithData } from "@/test/render";
import TransactionsPage from "./page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

describe("TransactionsPage", () => {
  it("does not show income (salary) rows in the activity list", () => {
    renderWithData(<TransactionsPage />);
    expect(screen.queryByText("Lön Företaget AB")).not.toBeInTheDocument();
  });
});
