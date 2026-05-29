import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithData } from "@/test/render";
import { CategoryEditor } from "./category-editor";
import type { Category } from "@/lib/domain/types";

const groceries: Category = { id: "cat-groceries", name: "Groceries", icon: "🛒", color: "150 60% 45%", parentId: "cat-food" };

describe("CategoryEditor", () => {
  it("renders a New category form (top-level, no Delete)", () => {
    renderWithData(<CategoryEditor category={null} parentId={null} onClose={() => {}} />);
    expect(screen.getByText("New category")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. Groceries")).toBeInTheDocument();
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("shows the parent when adding a subcategory", () => {
    // parentId cat-food exists in the seeded store ("Food & Drinks").
    renderWithData(<CategoryEditor category={null} parentId="cat-food" onClose={() => {}} />);
    expect(screen.getByText("New subcategory")).toBeInTheDocument();
    expect(screen.getByText(/Subcategory of/)).toBeInTheDocument();
  });

  it("renders an Edit form with Delete for an existing category", () => {
    renderWithData(<CategoryEditor category={groceries} parentId={null} onClose={() => {}} />);
    expect(screen.getByText("Edit category")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });
});
