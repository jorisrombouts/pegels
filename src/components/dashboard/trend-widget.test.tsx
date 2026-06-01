import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TrendWidget } from "./trend-widget";
import type { TrendSeries } from "@/lib/domain/selectors";

const keys = ["2024-10", "2024-11", "2024-12", "2025-01", "2025-02", "2025-03"];
const series: TrendSeries[] = [
  { id: "total", label: "Total", icon: null, color: "primary", points: keys.map((k, i) => ({ key: k, amount: [9000, 9500, 9200, 15000, 18000, 24142][i] })) },
  { id: "cat-food", label: "Food & Drinks", icon: "🍔", color: "145 58% 47%", points: keys.map((k, i) => ({ key: k, amount: [1000, 1100, 900, 1500, 1800, 4470][i] })) },
];

const money = (c: string) => c.replace(/\s/g, "");

describe("TrendWidget", () => {
  it("shows the title and the Total series' latest value by default", () => {
    const { container } = render(<TrendWidget series={series} size="medium" />);
    expect(screen.getByText("Trend · 6 months")).toBeInTheDocument();
    expect(money(container.textContent ?? "")).toContain("24142,00kr");
    expect(screen.getByText(/Total · March 2025/)).toBeInTheDocument();
  });

  it("renders a chip per series and switches to a category on click", async () => {
    const { container } = render(<TrendWidget series={series} size="medium" />);
    expect(screen.getByRole("button", { name: "Total" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Food & Drinks/ }));
    expect(money(container.textContent ?? "")).toContain("4470,00kr");
    expect(screen.getByText(/Food & Drinks · March 2025/)).toBeInTheDocument();
  });

  it("reveals subcategory chips when a parent is selected and switches to a sub", async () => {
    const withSub: TrendSeries[] = [
      ...series,
      { id: "cat-resto", label: "Restaurants", icon: "🍽️", color: "158 52% 50%", parentId: "cat-food",
        points: keys.map((k, i) => ({ key: k, amount: [100, 100, 100, 100, 100, 1234][i] })) },
    ];
    const { container } = render(<TrendWidget series={withSub} size="medium" />);
    // The sub chip is hidden until its parent is selected.
    expect(screen.queryByRole("button", { name: /Restaurants/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Food & Drinks/ }));
    const sub = screen.getByRole("button", { name: /Restaurants/ });
    await userEvent.click(sub);
    expect(money(container.textContent ?? "")).toContain("1234,00kr");
    expect(screen.getByText(/Restaurants · March 2025/)).toBeInTheDocument();
  });

  it("renders month axis labels at medium but not at small", () => {
    const { rerender } = render(<TrendWidget series={series} size="medium" />);
    expect(screen.getByText("Oct")).toBeInTheDocument();
    rerender(<TrendWidget series={series} size="small" />);
    expect(screen.queryByText("Oct")).not.toBeInTheDocument();
  });

  it("masks the amount when privacy mask is on", () => {
    const { container } = render(<TrendWidget series={series} masked />);
    expect(container.textContent).toContain("•••• kr");
  });
});
