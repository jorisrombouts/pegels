import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RecentActivity } from "./recent-activity";
import type { Category, Transaction } from "@/lib/domain/types";

const categoryById = new Map<string, Category>([
  ["cat-groceries", { id: "cat-groceries", name: "Groceries", icon: "🛒", color: "150 60% 45%", parentId: "cat-food" }],
]);

function tx(o: Partial<Transaction>): Transaction {
  return {
    id: "t", date: "2025-03-02", description: "ICA Maxi", amount: -487, accountId: "acc-lon",
    categoryId: "cat-groceries", predictedCategoryId: "cat-groceries", categoryConfidence: 0.9,
    categorySource: "model", needsReview: false, tagIds: [],
    kind: "expense", goalId: null, ...o,
  };
}

describe("RecentActivity", () => {
  it("lists transactions with their descriptions", () => {
    render(<RecentActivity transactions={[tx({ id: "a", description: "ICA Maxi" })]} categoryById={categoryById} />);
    expect(screen.getByText("ICA Maxi")).toBeInTheDocument();
  });

  it("strikes through excluded transactions", () => {
    render(<RecentActivity transactions={[tx({ id: "b", description: "Överföring", kind: "transfer" })]} categoryById={categoryById} />);
    expect(screen.getByText("Överföring").className).toContain("line-through");
  });

  it("never renders income rows", () => {
    render(
      <RecentActivity
        transactions={[
          tx({ id: "d", description: "ICA Maxi", kind: "expense", amount: -487 }),
          tx({ id: "e", description: "Lön", kind: "income", amount: 38500 }),
        ]}
        categoryById={categoryById}
      />,
    );
    expect(screen.getByText("ICA Maxi")).toBeInTheDocument();
    expect(screen.queryByText("Lön")).not.toBeInTheDocument();
  });

  it("masks amounts when privacy mask is on", () => {
    const { container } = render(<RecentActivity transactions={[tx({ id: "c" })]} categoryById={categoryById} masked />);
    expect(container.textContent).toContain("•••• kr");
  });
});
