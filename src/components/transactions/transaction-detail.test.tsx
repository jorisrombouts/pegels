import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithData } from "@/test/render";
import { seedDataset } from "@/data/mock";
import { TransactionDetail, DetailEmpty } from "./transaction-detail";

// Uses the real (seeded) Zustand store. tx-001 = "Hyra Mars" (Rent, 97% model confidence).
describe("TransactionDetail", () => {
  it("renders the headline, account and model confidence", () => {
    renderWithData(<TransactionDetail txId="tx-001" />);
    expect(screen.getByText("Hyra Mars")).toBeInTheDocument();
    expect(screen.getByText(/SEB/)).toBeInTheDocument();
    expect(screen.getByText("97%")).toBeInTheDocument();
  });

  it("shows 100% (not the model score) for a hand-corrected category", () => {
    const dataset = {
      ...seedDataset,
      transactions: seedDataset.transactions.map((t) =>
        t.id === "tx-001" ? { ...t, categorySource: "user" as const } : t,
      ),
    };
    renderWithData(<TransactionDetail txId="tx-001" />, { dataset });
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.queryByText("97%")).not.toBeInTheDocument();
  });

  it("can flag a transaction to not count toward spending", async () => {
    const user = userEvent.setup();
    renderWithData(<TransactionDetail txId="tx-001" />);
    const toggle = screen.getByRole("switch", { name: /count this transaction/i });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(toggle).toBeChecked();
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

  it("shows an Approve button for a needs-review transaction and clears the flag when clicked", async () => {
    const user = userEvent.setup();
    const dataset = {
      ...seedDataset,
      transactions: seedDataset.transactions.map((t) => (t.id === "tx-001" ? { ...t, needsReview: true } : t)),
    };
    renderWithData(<TransactionDetail txId="tx-001" />, { dataset });
    await user.click(screen.getByRole("button", { name: /approve/i }));
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });

  it("shows no Approve button when the transaction does not need review", () => {
    const dataset = {
      ...seedDataset,
      transactions: seedDataset.transactions.map((t) => (t.id === "tx-001" ? { ...t, needsReview: false } : t)),
    };
    renderWithData(<TransactionDetail txId="tx-001" />, { dataset });
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
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
