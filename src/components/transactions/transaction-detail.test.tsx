import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("exposes a notes field", () => {
    renderWithData(<TransactionDetail txId="tx-001" />);
    expect(screen.getByPlaceholderText("Add a note…")).toBeInTheDocument();
  });

  it("shows a Type control and a goal picker when Transfer is chosen", async () => {
    const user = userEvent.setup();
    renderWithData(<TransactionDetail txId="tx-001" />);
    expect(screen.getByText("Type")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /transfer/i }));
    expect(screen.getByText(/Counts toward goal/i)).toBeInTheDocument();
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
