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

  it("shows a confidence dot with a percentage title", () => {
    const { container } = render(<CategoryChip category={groceries} confidence={0.61} />);
    expect(container.querySelector('[title="61% confidence"]')).toBeInTheDocument();
  });
});
