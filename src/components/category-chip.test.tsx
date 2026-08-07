import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CategoryChip } from "./category-chip";
import type { Category } from "@/lib/domain/types";

const groceries: Category = { id: "cat-groceries", name: "Groceries", icon: "🛒", color: "150 60% 45%", parentId: "cat-food" };

describe("CategoryChip", () => {
  it("renders the category name and icon", () => {
    render(<CategoryChip category={groceries} />);
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.getByText("🛒")).toBeInTheDocument();
  });

  it("falls back to Uncategorized when no category", () => {
    render(<CategoryChip category={undefined} />);
    expect(screen.getByText("Uncategorized")).toBeInTheDocument();
  });

  it("marks an unseen merchant with a dot the user can hover for the reason", () => {
    // Named rather than scored: a percentage would imply a calibration the model doesn't have.
    render(<CategoryChip category={groceries} level="unsure" />);
    expect(screen.getByLabelText("New merchant")).toBeInTheDocument();
  });

  it("shows no dot when there is no level to report", () => {
    const { container } = render(<CategoryChip category={groceries} />);
    expect(container.querySelector("[aria-label]")).toBeNull();
  });
});
