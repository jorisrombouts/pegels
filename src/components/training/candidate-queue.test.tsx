import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CandidateQueue } from "./candidate-queue";
import type { CurationRow } from "@/app/actions/corpus";
import type { Category } from "@/lib/domain/types";

const CATEGORIES: Category[] = [
  { id: "cat-groceries", name: "Groceries", icon: "🛒", color: "0 0% 0%", parentId: null },
  { id: "cat-transit", name: "Transit", icon: "🚌", color: "0 0% 0%", parentId: null },
];

let seq = 0;
const row = (description: string, o: Partial<CurationRow> = {}): CurationRow => ({
  id: `ex-${++seq}`,
  dedupKey: description.toLowerCase(),
  cleanedDescription: description,
  amount: -487,
  finalKind: "expense",
  finalCategoryId: "cat-groceries",
  finalTagIds: [],
  hitCount: 1,
  lastSeenAt: "2025-06-01",
  status: "candidate",
  gold: false,
  source: "import",
  createdAt: "2025-06-01",
  embedded: true,
  ...o,
});

const noop = () => {};

describe("CandidateQueue", () => {
  it("shows how many times each merchant has been seen", () => {
    render(<CandidateQueue rows={[row("ICA MAXI", { hitCount: 47 })]} categories={CATEGORIES} onApprove={noop} onReject={noop} />);
    expect(screen.getByText("ICA MAXI")).toBeInTheDocument();
    expect(screen.getByText(/seen 47×/)).toBeInTheDocument();
  });

  it("approves with the row's existing category when it is already right", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    render(<CandidateQueue rows={[row("ICA MAXI")]} categories={CATEGORIES} onApprove={onApprove} onReject={noop} />);
    await user.click(screen.getByRole("button", { name: /approve ICA MAXI/i }));
    expect(onApprove).toHaveBeenCalledWith("ex-2", { finalCategoryId: "cat-groceries" });
  });

  it("dismisses a merchant without approving it", async () => {
    const user = userEvent.setup();
    const onReject = vi.fn();
    const onApprove = vi.fn();
    render(<CandidateQueue rows={[row("SKRÄPPOST")]} categories={CATEGORIES} onApprove={onApprove} onReject={onReject} />);
    await user.click(screen.getByRole("button", { name: /dismiss SKRÄPPOST/i }));
    expect(onReject).toHaveBeenCalledWith("ex-3");
    expect(onApprove).not.toHaveBeenCalled();
  });

  it("says so plainly when the queue is empty", () => {
    render(<CandidateQueue rows={[]} categories={CATEGORIES} onApprove={noop} onReject={noop} />);
    expect(screen.getByText(/nothing waiting/i)).toBeInTheDocument();
  });

  it("notes a non-expense kind, which changes what approving means", () => {
    render(
      <CandidateQueue
        rows={[row("LÖN ACME", { finalKind: "income", finalCategoryId: null })]}
        categories={CATEGORIES}
        onApprove={noop}
        onReject={noop}
      />,
    );
    expect(screen.getByText(/income/)).toBeInTheDocument();
  });
});
