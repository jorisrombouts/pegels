import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TransactionRow } from "./transaction-row";
import type { Category, Transaction } from "@/lib/domain/types";

const groceries: Category = { id: "cat-groceries", name: "Groceries", icon: "🛒", color: "150 60% 45%", parentId: "cat-food" };
const cafe: Category = { id: "cat-cafe", name: "Café", icon: "☕", color: "30 60% 50%", parentId: null };

function tx(o: Partial<Transaction>): Transaction {
  return {
    id: "t", date: "2025-03-02", description: "ICA Maxi", amount: -487, accountId: "acc-lon",
    categoryId: "cat-groceries", predictedCategoryId: "cat-groceries", categoryConfidence: 0.9,
    categorySource: "model", needsReview: false, tagIds: [],
    kind: "expense", goalId: null, ...o,
  };
}

describe("TransactionRow", () => {
  it("renders description and amount", () => {
    render(<TransactionRow tx={tx({})} category={groceries} selected={false} onSelect={() => {}} />);
    expect(screen.getByText("ICA Maxi")).toBeInTheDocument();
  });

  it("dims and labels transfer transactions", () => {
    render(<TransactionRow tx={tx({ description: "Överföring", kind: "transfer" })} category={undefined} selected={false} onSelect={() => {}} />);
    expect(screen.getByText("Överföring").className).toContain("line-through");
    expect(screen.getByText("Transfer")).toBeInTheDocument();
  });

  it("dims, strikes through, and tags an excluded transaction", () => {
    render(<TransactionRow tx={tx({ excluded: true })} category={groceries} selected={false} onSelect={() => {}} />);
    expect(screen.getByText("Ignored")).toBeInTheDocument();
    expect(screen.getByText("ICA Maxi").className).toContain("line-through");
  });

  it("shows a needs-review indicator", () => {
    render(<TransactionRow tx={tx({ needsReview: true })} category={groceries} selected={false} onSelect={() => {}} />);
    expect(screen.getByLabelText("Needs review")).toBeInTheDocument();
  });

  it("calls onSelect when clicked", async () => {
    const onSelect = vi.fn();
    render(<TransactionRow tx={tx({})} category={groceries} selected={false} onSelect={onSelect} />);
    await userEvent.click(screen.getByText("ICA Maxi"));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("shows only the user's share (not the gross) for a split expense, with a Split tag", () => {
    render(
      <TransactionRow
        tx={tx({ amount: -300.61, splits: [
          { id: "a", amount: 150.31, mine: true },
          { id: "b", amount: 150.3, mine: false },
        ] })}
        category={groceries}
        selected={false}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText("Split")).toBeInTheDocument();
    expect(screen.getByText(/150,31/)).toBeInTheDocument();
    expect(screen.queryByText(/300,61/)).not.toBeInTheDocument();
  });

  it("masks the amount when privacy mask is on", () => {
    const { container } = render(<TransactionRow tx={tx({})} category={groceries} selected={false} onSelect={() => {}} masked />);
    expect(container.textContent).toContain("•••• kr");
  });

  it("always masks the amount for income rows even when privacy mask is off", () => {
    render(<TransactionRow tx={tx({ amount: 42500, kind: "income", description: "Lön" })} category={undefined} selected={false} onSelect={() => {}} />);
    expect(screen.getByText("Lön")).toBeInTheDocument();
    expect(screen.queryByText(/42\s?500/)).not.toBeInTheDocument();
    expect(screen.getByText(/••••/)).toBeInTheDocument();
    expect(screen.getByText("Income")).toBeInTheDocument();
  });

  it("renders an inline category picker for a needs-review row when correctable", () => {
    render(
      <TransactionRow tx={tx({ needsReview: true })} category={undefined} selected={false} onSelect={() => {}} categories={[groceries, cafe]} onCorrect={() => {}} />,
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("does not render the picker for a settled (non-review) row", () => {
    render(
      <TransactionRow tx={tx({ needsReview: false })} category={groceries} selected={false} onSelect={() => {}} categories={[groceries, cafe]} onCorrect={() => {}} />,
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("calls onCorrect with the row and chosen category, without opening the detail", async () => {
    const onCorrect = vi.fn();
    const onSelect = vi.fn();
    render(
      <TransactionRow tx={tx({ id: "t7", needsReview: true })} category={undefined} selected={false} onSelect={onSelect} categories={[groceries, cafe]} onCorrect={onCorrect} />,
    );
    await userEvent.selectOptions(screen.getByRole("combobox"), "cat-cafe");
    expect(onCorrect).toHaveBeenCalledWith(expect.objectContaining({ id: "t7" }), "cat-cafe");
    expect(onSelect).not.toHaveBeenCalled();
  });
});
