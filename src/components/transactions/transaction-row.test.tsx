import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TransactionRow } from "./transaction-row";
import type { Category, Transaction } from "@/lib/domain/types";

const groceries: Category = { id: "cat-groceries", name: "Groceries", icon: "🛒", color: "150 60% 45%", parentId: "cat-food" };

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

  it("masks the amount when privacy mask is on", () => {
    const { container } = render(<TransactionRow tx={tx({})} category={groceries} selected={false} onSelect={() => {}} masked />);
    expect(container.textContent).toContain("•••• kr");
  });
});
