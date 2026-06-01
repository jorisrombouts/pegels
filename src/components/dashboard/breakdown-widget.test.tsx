import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BreakdownWidget } from "./breakdown-widget";
import { computeDashboard } from "./compute";
import { seedDataset } from "@/data/mock";
import { buildMaps, categoryTrends, dailySpend } from "@/lib/domain/selectors";
import type { DashCtx } from "./registry";

function ctx(onNavigate = () => {}): DashCtx {
  const maps = buildMaps(seedDataset.categories);
  const month = "2025-03";
  return {
    d: computeDashboard(seedDataset, month, "all", new Date("2025-03-31T12:00:00Z")),
    masked: false, month, categoryById: maps.categoryById,
    recent: [], trend: categoryTrends(seedDataset.transactions, maps, seedDataset.categories, month, 6),
    daily: dailySpend(seedDataset.transactions, maps, month), onNavigate,
  };
}

describe("BreakdownWidget", () => {
  it("renders category bars by default and switches to tags via the toggle", () => {
    render(<BreakdownWidget ctx={ctx()} size="large" />);
    expect(screen.getByText("Food & Drinks")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Tags"));
    expect(screen.getByText(/Tags can overlap/i)).toBeInTheDocument();
  });

  it("toggles a category open/closed via its chevron row", () => {
    render(<BreakdownWidget ctx={ctx()} size="large" />);
    // Collapsed: an expandable category exposes an "Expand" control and no subcategory yet.
    const toggle = screen.getByLabelText("Expand Food & Drinks");
    expect(screen.queryByText("Groceries")).not.toBeInTheDocument();
    fireEvent.click(toggle); // unfold
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Collapse Food & Drinks")); // fold again
    expect(screen.queryByText("Groceries")).not.toBeInTheDocument();
  });

  it("deep-links to filtered transactions from a leaf (subcategory) row", () => {
    const onNavigate = vi.fn();
    render(<BreakdownWidget ctx={ctx(onNavigate)} size="large" />);
    fireEvent.click(screen.getByLabelText("Expand Food & Drinks"));
    fireEvent.click(screen.getByText("Groceries")); // a leaf row navigates
    expect(onNavigate).toHaveBeenCalledWith(expect.stringContaining("/transactions?category="));
  });

  it("a non-expandable mode (tags) deep-links on row tap", () => {
    const onNavigate = vi.fn();
    render(<BreakdownWidget ctx={ctx(onNavigate)} size="large" />);
    fireEvent.click(screen.getByText("Tags"));
    fireEvent.click(screen.getByText("Fixed cost")); // a tag row (no chevron) navigates
    expect(onNavigate).toHaveBeenCalledWith(expect.stringContaining("/transactions?tag="));
  });

  it("hides the toggle at small size", () => {
    render(<BreakdownWidget ctx={ctx()} size="small" />);
    expect(screen.queryByText("Tags")).not.toBeInTheDocument();
  });
});
