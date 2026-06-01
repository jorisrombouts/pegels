import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SplitEditor } from "./split-editor";

describe("SplitEditor", () => {
  it("offers Add split / Split evenly when there are no splits", () => {
    render(<SplitEditor amount={-890} splits={undefined} onChange={() => {}} />);
    expect(screen.getByText("+ Add split")).toBeInTheDocument();
    expect(screen.getByText("Split evenly")).toBeInTheDocument();
  });

  it("splits evenly two ways by default (mine + the rest)", async () => {
    const onChange = vi.fn();
    render(<SplitEditor amount={-890} splits={undefined} onChange={onChange} />);
    await userEvent.click(screen.getByText("Split evenly"));
    const splits = onChange.mock.calls[0][0];
    expect(splits).toHaveLength(2);
    expect(splits[0].mine).toBe(true);
    expect(splits[1].mine).toBe(false);
    expect(splits[0].amount).toBe(445);
    expect(splits[0].amount + splits[1].amount).toBeCloseTo(890, 2);
  });

  it("divides by the chosen number of people", async () => {
    const onChange = vi.fn();
    render(<SplitEditor amount={-890} splits={undefined} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "More people" })); // 2 → 3
    await userEvent.click(screen.getByText("Split evenly"));
    const splits = onChange.mock.calls[0][0];
    expect(splits[0].mine).toBe(true);
    expect(splits[0].amount).toBeCloseTo(296.67, 2); // 890 / 3
    expect(splits[0].amount + splits[1].amount).toBeCloseTo(890, 2);
  });

  it("does not let the people count drop below 2", async () => {
    render(<SplitEditor amount={-890} splits={undefined} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Fewer people" })).toBeDisabled();
  });

  it("shows the mine total when splits exist", () => {
    render(
      <SplitEditor
        amount={-890}
        splits={[
          { id: "a", amount: 445, mine: true },
          { id: "b", amount: 445, mine: false },
        ]}
        onChange={() => {}}
      />,
    );
    expect((screen.getByText(/You pay/).textContent ?? "").replace(/\s/g, "")).toContain("445,00kr");
  });
});
