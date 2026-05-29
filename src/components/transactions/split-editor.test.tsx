import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SplitEditor } from "./split-editor";

describe("SplitEditor", () => {
  it("offers Add split / Equal split when there are no splits", () => {
    render(<SplitEditor amount={-890} splits={undefined} onChange={() => {}} />);
    expect(screen.getByText("+ Add split")).toBeInTheDocument();
    expect(screen.getByText("Equal split")).toBeInTheDocument();
  });

  it("Equal split produces a mine + non-mine half", async () => {
    const onChange = vi.fn();
    render(<SplitEditor amount={-890} splits={undefined} onChange={onChange} />);
    await userEvent.click(screen.getByText("Equal split"));
    const splits = onChange.mock.calls[0][0];
    expect(splits).toHaveLength(2);
    expect(splits[0].mine).toBe(true);
    expect(splits[1].mine).toBe(false);
    expect(splits[0].amount + splits[1].amount).toBe(890);
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
    expect((screen.getByText(/You pay/).textContent ?? "").replace(/\s/g, "")).toContain("445kr");
  });
});
