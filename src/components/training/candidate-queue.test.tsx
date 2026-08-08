import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithData } from "@/test/render";
import { CandidateQueue } from "./candidate-queue";
import type { CurationRow } from "@/lib/corpus/types";
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
  it("shows how many transactions each shop covers", () => {
    renderWithData(<CandidateQueue rows={[row("ICA MAXI", { hitCount: 47 })]} categories={CATEGORIES} onApprove={noop} onReject={noop} />);
    expect(screen.getByText("ICA MAXI")).toBeInTheDocument();
    expect(screen.getByText(/47 transactions/)).toBeInTheDocument();
  });

  it("approves with the row's existing category when it is already right", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const ica = row("ICA MAXI");
    renderWithData(<CandidateQueue rows={[ica]} categories={CATEGORIES} onApprove={onApprove} onReject={noop} />);
    await user.click(screen.getByRole("button", { name: /approve ICA MAXI/i }));
    // Kind rides along with every approval now, so a merchant approved as income/transfer keeps
    // that classification rather than silently reverting to the row's original kind.
    expect(onApprove).toHaveBeenCalledWith(ica.id, { finalCategoryId: "cat-groceries", finalKind: "expense" });
  });

  it("approves as income with no category, since only expenses carry one", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    renderWithData(<CandidateQueue rows={[row("LÖN")]} categories={CATEGORIES} onApprove={onApprove} onReject={noop} />);
    await user.click(screen.getByRole("button", { name: "income" }));
    await user.click(screen.getByRole("button", { name: /approve LÖN/i }));
    expect(onApprove).toHaveBeenCalledWith(expect.any(String), { finalCategoryId: null, finalKind: "income" });
  });

  it("carries edited tags into the approval", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    renderWithData(<CandidateQueue rows={[row("HALLON")]} categories={CATEGORIES} onApprove={onApprove} onReject={noop} />);
    await user.click(screen.getByRole("button", { name: /^Add/ }));
    await user.click(await screen.findByRole("button", { name: /Subscription/i }));
    await user.click(screen.getByRole("button", { name: /approve HALLON/i }));
    expect(onApprove).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ finalTagIds: expect.arrayContaining([expect.any(String)]) }),
    );
  });

  it("dismisses a merchant without approving it", async () => {
    const user = userEvent.setup();
    const onReject = vi.fn();
    const onApprove = vi.fn();
    // Bind to the row's own id rather than a positional one — the shared seq counter shifts
    // whenever a test is added above this one.
    const junk = row("SKRÄPPOST");
    renderWithData(<CandidateQueue rows={[junk]} categories={CATEGORIES} onApprove={onApprove} onReject={onReject} />);
    await user.click(screen.getByRole("button", { name: /dismiss SKRÄPPOST/i }));
    expect(onReject).toHaveBeenCalledWith(junk.id);
    expect(onApprove).not.toHaveBeenCalled();
  });

  it("says so plainly when the queue is empty", () => {
    renderWithData(<CandidateQueue rows={[]} categories={CATEGORIES} onApprove={noop} onReject={noop} />);
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
  });

  it("pages a long queue rather than rendering all of it", () => {
    const rows = Array.from({ length: 45 }, (_, i) => row(`MERCHANT ${String(i).padStart(3, "0")}`));
    renderWithData(<CandidateQueue rows={rows} categories={CATEGORIES} onApprove={noop} onReject={noop} />);
    expect(screen.getByText("MERCHANT 000")).toBeInTheDocument();
    expect(screen.queryByText("MERCHANT 025")).not.toBeInTheDocument();
    expect(screen.getByText(/1–20 of 45 places/)).toBeInTheDocument();
  });

  it("falls back to the last page when approvals shrink the queue underneath it", async () => {
    // The real failure mode: work the last page down and it stops existing, which would otherwise
    // render as an empty list and look like the remaining work had vanished.
    const user = userEvent.setup();
    const rows = Array.from({ length: 45 }, (_, i) => row(`M${String(i).padStart(3, "0")}`));
    const { rerender } = renderWithData(
      <CandidateQueue rows={rows} categories={CATEGORIES} onApprove={noop} onReject={noop} />,
    );
    await user.click(screen.getByRole("button", { name: /next page/i }));
    await user.click(screen.getByRole("button", { name: /next page/i })); // page 3 of 3
    expect(screen.getByText(/41–45 of 45/)).toBeInTheDocument();

    // Approving those five leaves two pages; the view drops back to the new last one.
    rerender(<CandidateQueue rows={rows.slice(0, 40)} categories={CATEGORIES} onApprove={noop} onReject={noop} />);
    expect(screen.getByText(/21–40 of 40/)).toBeInTheDocument();
    expect(screen.getByText("M020")).toBeInTheDocument();
  });

  it("collapses to a single page, hiding the pager, once few enough remain", () => {
    const rows = Array.from({ length: 8 }, (_, i) => row(`M${i}`));
    renderWithData(<CandidateQueue rows={rows} categories={CATEGORIES} onApprove={noop} onReject={noop} />);
    expect(screen.queryByRole("button", { name: /next page/i })).not.toBeInTheDocument();
    expect(screen.getByText("M7")).toBeInTheDocument();
  });

  it("notes a non-expense kind, which changes what approving means", () => {
    renderWithData(
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
