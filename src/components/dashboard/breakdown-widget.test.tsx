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

  it("expands a category into subcategories on bar tap", () => {
    render(<BreakdownWidget ctx={ctx()} size="large" />);
    fireEvent.click(screen.getByLabelText("Expand Food & Drinks"));
    expect(screen.getByText("Groceries")).toBeInTheDocument();
  });

  it("deep-links on label tap", () => {
    const onNavigate = vi.fn();
    render(<BreakdownWidget ctx={ctx(onNavigate)} size="large" />);
    fireEvent.click(screen.getByText("Food & Drinks"));
    expect(onNavigate).toHaveBeenCalledWith(expect.stringContaining("/transactions?category="));
  });

  it("hides the toggle at small size", () => {
    render(<BreakdownWidget ctx={ctx()} size="small" />);
    expect(screen.queryByText("Tags")).not.toBeInTheDocument();
  });
});
