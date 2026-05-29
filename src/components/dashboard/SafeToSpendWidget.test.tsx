import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SafeToSpendWidget, type SafeToSpendData } from "./safe-to-spend-widget";

const data: SafeToSpendData = { spent: 6711, limit: 11500, daysElapsed: 31, daysInMonth: 31 };

describe("SafeToSpendWidget", () => {
  it("size='small' shows essentials but no sparkline or 'ideal pace' legend", () => {
    render(<SafeToSpendWidget data={data} size="small" />);
    expect(screen.getByText("Daily Pace")).toBeInTheDocument();
    expect(screen.getByText("58%")).toBeInTheDocument(); // 6711/11500
    expect(screen.queryByTestId("safe-to-spend-sparkline")).not.toBeInTheDocument();
    expect(screen.queryByText("ideal pace")).not.toBeInTheDocument();
  });

  it("size='medium' renders the sparkline and the actual/ideal legend", () => {
    render(<SafeToSpendWidget data={data} size="medium" />);
    expect(screen.getByTestId("safe-to-spend-sparkline")).toBeInTheDocument();
    expect(screen.getByText("ideal pace")).toBeInTheDocument();
    expect(screen.getByText("actual")).toBeInTheDocument();
  });

  it("renders a no-budget empty state with a CTA when limit is 0", () => {
    render(<SafeToSpendWidget data={{ ...data, limit: 0 }} />);
    expect(screen.getByText(/no budget set/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /set a budget/i })).toBeInTheDocument();
  });

  it("masks amounts when privacy mask is on", () => {
    render(<SafeToSpendWidget data={data} size="small" masked />);
    expect(screen.getAllByText(/•••• kr/).length).toBeGreaterThan(0);
  });
});
