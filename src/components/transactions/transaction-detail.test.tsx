import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithData } from "@/test/render";
import { TransactionDetail, DetailEmpty } from "./transaction-detail";

// Uses the real (seeded) Zustand store. tx-001 = "Hyra Mars" (Rent, 97% model confidence).
describe("TransactionDetail", () => {
  it("renders the headline, account and model confidence", () => {
    renderWithData(<TransactionDetail txId="tx-001" />);
    expect(screen.getByText("Hyra Mars")).toBeInTheDocument();
    expect(screen.getByText(/Nordea Lönekonto/)).toBeInTheDocument();
    expect(screen.getByText("97%")).toBeInTheDocument();
  });

  it("exposes an exclude-from-totals switch and a notes field", () => {
    renderWithData(<TransactionDetail txId="tx-001" />);
    expect(screen.getByLabelText("Exclude from totals")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Add a note…")).toBeInTheDocument();
  });

  it("falls back to the empty state for an unknown id", () => {
    renderWithData(<TransactionDetail txId="nope" />);
    expect(screen.getByText("Select an item")).toBeInTheDocument();
  });

  it("DetailEmpty renders the prompt", () => {
    renderWithData(<DetailEmpty />);
    expect(screen.getByText(/Pick a transaction/)).toBeInTheDocument();
  });
});
