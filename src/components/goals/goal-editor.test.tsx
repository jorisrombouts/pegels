import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithData } from "@/test/render";
import { GoalEditor } from "./goal-editor";
import type { Goal } from "@/lib/domain/types";

const goal: Goal = {
  id: "goal-japan", name: "Japan Trip", icon: "🗾", target: 25000, baseline: 6000,
  deadline: "2025-06-02", accountId: null,
};

describe("GoalEditor", () => {
  it("renders a New goal form", () => {
    renderWithData(<GoalEditor goal={null} onClose={() => {}} />);
    expect(screen.getByText("New goal")).toBeInTheDocument();
    expect(screen.getByText("Target (kr)")).toBeInTheDocument();
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("renders an Edit form with Delete for an existing goal", () => {
    renderWithData(<GoalEditor goal={goal} onClose={() => {}} />);
    expect(screen.getByText("Edit goal")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });
});
