import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CategoryDonut } from "./category-donut";
import type { CategorySpend } from "@/lib/domain/selectors";

const data: CategorySpend[] = [
  { category: { id: "cat-food", name: "Food & Drinks", icon: "🍔", color: "145 58% 47%", parentId: null }, amount: 4470 },
  { category: { id: "cat-housing", name: "Housing", icon: "🏠", color: "214 85% 60%", parentId: null }, amount: 12500 },
];

describe("CategoryDonut", () => {
  it("renders the donut container with the month total in the center", () => {
    const { container } = render(<CategoryDonut data={data} total={16970} />);
    expect(screen.getByTestId("category-donut")).toBeInTheDocument();
    // Normalize all whitespace (formatSEK uses a non-breaking space).
    expect((container.textContent ?? "").replace(/\s/g, "")).toContain("−16970kr");
  });

  it("masks the center total when privacy mask is on", () => {
    const { container } = render(<CategoryDonut data={data} total={16970} masked />);
    expect(container.textContent).toContain("•••• kr");
  });
});
