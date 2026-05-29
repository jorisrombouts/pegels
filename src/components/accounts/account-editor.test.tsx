import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithData } from "@/test/render";
import { AccountEditor } from "./account-editor";
import type { Account } from "@/lib/domain/types";

// id not present in the seeded store → usedCount 0 → Delete enabled.
const account: Account = { id: "acc-x", name: "Test", type: "Checking", kind: "spending", icon: "🏦", color: "217 91% 60%", balance: 0, archived: false };

describe("AccountEditor", () => {
  it("renders a New account form with Type and Kind controls", () => {
    renderWithData(<AccountEditor account={null} onClose={() => {}} />);
    expect(screen.getByText("New account")).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "spending" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "savings" })).toBeInTheDocument();
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("renders an Edit form with usage count, archive switch and Delete", () => {
    renderWithData(<AccountEditor account={account} onClose={() => {}} />);
    expect(screen.getByText("Edit account")).toBeInTheDocument();
    expect(screen.getByText(/Used by 0 transactions/)).toBeInTheDocument();
    expect(screen.getByLabelText("Archive account")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });
});
