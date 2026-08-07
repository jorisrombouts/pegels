import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DASHBOARD_LAYOUT, colSpan, widgets, type DashCtx, type WidgetSize } from "./registry";
import { computeDashboard } from "./compute";
import { seedDataset } from "@/data/mock";
import { buildMaps, categoryTrends, dailySpend } from "@/lib/domain/selectors";

describe("dashboard registry", () => {
  it("maps size to distinct column widths (small 1/4, medium 1/2, large full)", () => {
    expect(colSpan("small")).toBe("lg:col-span-1");
    expect(colSpan("medium")).toBe("md:col-span-2 lg:col-span-2");
    expect(colSpan("large")).toBe("md:col-span-2 lg:col-span-4");
  });

  it("has a renderer for every widget in the layout", () => {
    for (const { id } of DASHBOARD_LAYOUT) {
      expect(widgets[id], `missing renderer for "${id}"`).toBeTypeOf("function");
    }
  });

  it("registers no renderer that the layout never renders", () => {
    const layoutIds = new Set(DASHBOARD_LAYOUT.map((w) => w.id));
    for (const id of Object.keys(widgets)) {
      expect(layoutIds.has(id), `renderer "${id}" is not in DASHBOARD_LAYOUT`).toBe(true);
    }
  });
});

// Build a realistic context from the seed data, exactly like the page does.
function makeCtx(): DashCtx {
  const maps = buildMaps(seedDataset.categories);
  const month = "2025-03";
  return {
    d: computeDashboard(seedDataset, month, "all", new Date("2025-03-31T12:00:00Z")),
    masked: false,
    month,
    categoryById: maps.categoryById,
    recent: [...seedDataset.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    trend: categoryTrends(seedDataset.transactions, maps, seedDataset.categories, month, 6),
    daily: dailySpend(seedDataset.transactions, maps, month),
    onNavigate: () => {},
  };
}

const SIZES: WidgetSize[] = ["small", "medium", "large"];

describe("total widget hero", () => {
  const midMonth: DashCtx = {
    ...makeCtx(),
    d: computeDashboard(seedDataset, "2025-03", "all", new Date("2025-03-15T12:00:00Z")),
  };

  it("offers a forward-looking daily allowance, not a backward-looking average", () => {
    render(<>{widgets.total(midMonth, "large")}</>);
    expect(screen.getByText("Left to spend")).toBeInTheDocument();
    expect(screen.getByText(/days left/)).toBeInTheDocument();
    expect(screen.queryByText("Daily pace")).not.toBeInTheDocument();
  });

  it("shows a projection, never the old budget tiles or an Income line", () => {
    render(<>{widgets.total(midMonth, "large")}</>);
    expect(screen.getByText("Projected")).toBeInTheDocument();
    expect(screen.queryByText("Income")).not.toBeInTheDocument();
    expect(screen.queryByText("Safe to spend")).not.toBeInTheDocument();
    expect(screen.queryByText("Over budget")).not.toBeInTheDocument();
  });

  it("breaks the month down into what is committed and what is discretionary", () => {
    render(<>{widgets.total(midMonth, "large")}</>);
    expect(screen.getByText(/fixed ·/)).toBeInTheDocument();
    expect(screen.getByText(/variable/)).toBeInTheDocument();
  });

  it("falls back to the variable pace when there is no target to steer towards", () => {
    // Last day of the month: no days left, so a daily allowance would be meaningless.
    render(<>{widgets.total(makeCtx(), "large")}</>);
    expect(screen.getByText("Variable pace")).toBeInTheDocument();
  });

  it("renders the hero even with no budgets (budgets no longer drive it)", () => {
    const noBudget: DashCtx = {
      ...midMonth,
      d: computeDashboard({ ...seedDataset, budgets: [] }, "2025-03", "all", new Date("2025-03-15T12:00:00Z")),
    };
    render(<>{widgets.total(noBudget, "large")}</>);
    expect(screen.getByText("Projected")).toBeInTheDocument();
  });
});

describe("every widget renders at every size", () => {
  const ctx = makeCtx();
  for (const { id } of DASHBOARD_LAYOUT) {
    for (const size of SIZES) {
      it(`${id} @ ${size} renders content without throwing`, () => {
        const { container, unmount } = render(<>{widgets[id](ctx, size)}</>);
        expect((container.textContent ?? "").trim().length).toBeGreaterThan(0);
        unmount();
      });
    }
  }
});
