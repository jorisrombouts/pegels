import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithData } from "@/test/render";
import { BudgetEditor } from "./budget-editor";
import type { Budget } from "@/lib/domain/types";

const budget: Budget = { id: "bud-food", categoryId: "cat-food", limit: 5000, month: null };

describe("BudgetEditor", () => {
  it("renders a New budget form with a limit field", () => {
    renderWithData(<BudgetEditor budget={null} month="2025-03" onClose={() => {}} />);
    expect(screen.getByText("New budget")).toBeInTheDocument();
    expect(screen.getByText("Monthly limit (kr)")).toBeInTheDocument();
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("renders an Edit form with a Delete action for an existing budget", () => {
    renderWithData(<BudgetEditor budget={budget} month="2025-03" onClose={() => {}} />);
    expect(screen.getByText("Edit budget")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
    expect(screen.getByLabelText("Repeat every month")).toBeInTheDocument();
  });
});
