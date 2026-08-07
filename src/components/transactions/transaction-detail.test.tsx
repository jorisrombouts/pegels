import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithData } from "@/test/render";
import { seedDataset } from "@/data/mock";
import { TransactionDetail, DetailEmpty } from "./transaction-detail";
import { recordExamples } from "@/app/actions/corpus";

// vitest.setup.ts stubs the corpus action globally; spy on it to assert what gets captured.
vi.mock("@/app/actions/corpus", () => ({ recordExamples: vi.fn(async () => {}) }));
const recorded = vi.mocked(recordExamples);

beforeEach(() => recorded.mockClear());

// Uses the real (seeded) Zustand store. tx-001 = "Hyra Mars" (Rent, 97% model confidence).
describe("TransactionDetail", () => {
  it("renders the headline and account", () => {
    renderWithData(<TransactionDetail txId="tx-001" />);
    expect(screen.getByText("Hyra Mars")).toBeInTheDocument();
    expect(screen.getByText(/SEB/)).toBeInTheDocument();
  });

  it("names how much a categorization is worth trusting instead of scoring it", () => {
    // A percentage implied a calibration the model doesn't have — on the hold-out its mean
    // confidence on right and on wrong answers were indistinguishable.
    const dataset = {
      ...seedDataset,
      transactions: seedDataset.transactions.map((t) =>
        t.id === "tx-001" ? { ...t, categorySource: "model" as const, categoryLevel: "unsure" as const } : t,
      ),
    };
    renderWithData(<TransactionDetail txId="tx-001" />, { dataset });
    expect(screen.getByText("New merchant")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("credits the user, not the model, for a hand-corrected category", () => {
    const dataset = {
      ...seedDataset,
      transactions: seedDataset.transactions.map((t) =>
        t.id === "tx-001" ? { ...t, categorySource: "user" as const, categoryLevel: "unsure" as const } : t,
      ),
    };
    renderWithData(<TransactionDetail txId="tx-001" />, { dataset });
    expect(screen.getByText("Your choice")).toBeInTheDocument();
    // The model's stale opinion must not leak through once the user has overridden it.
    expect(screen.queryByText("New merchant")).not.toBeInTheDocument();
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

  it("captures a tag edit as corpus evidence", async () => {
    // This hook never existed: TagEditor only wrote the transaction, so every tag correction was
    // invisible to the learning loop.
    const user = userEvent.setup();
    const tx = seedDataset.transactions.find((t) => t.id === "tx-001")!;
    const existing = seedDataset.tags.find((t) => !tx.tagIds.includes(t.id))!;
    renderWithData(<TransactionDetail txId="tx-001" />);

    await user.click(screen.getByRole("button", { name: /^Add$/ }));
    await user.click(await screen.findByRole("button", { name: existing.name }));

    await waitFor(() => expect(recorded).toHaveBeenCalled(), { timeout: 2000 });
    const [rows, source] = recorded.mock.calls.at(-1)!;
    expect(source).toBe("detail");
    expect(rows[0].finalTagIds).toContain(existing.id);
  });

  it("captures an approval as corpus evidence, carrying the merchant and its label", async () => {
    const user = userEvent.setup();
    const dataset = {
      ...seedDataset,
      transactions: seedDataset.transactions.map((t) => (t.id === "tx-001" ? { ...t, needsReview: true } : t)),
    };
    renderWithData(<TransactionDetail txId="tx-001" />, { dataset });
    await user.click(screen.getByRole("button", { name: /approve/i }));

    await waitFor(() => expect(recorded).toHaveBeenCalled());
    const [rows, source] = recorded.mock.calls.at(-1)!;
    expect(source).toBe("detail");
    expect(rows[0].cleanedDescription).toBe("Hyra Mars");
    expect(rows[0].finalCategoryId).toBe("cat-rent");
  });

  it("shows a Type control offering expense, income and transfer", () => {
    renderWithData(<TransactionDetail txId="tx-001" />);
    expect(screen.getByText("Type")).toBeInTheDocument();
    for (const kind of ["expense", "income", "transfer"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${kind}$`, "i") })).toBeInTheDocument();
    }
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
