import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { colSpan, widgets, widgetTitles, type DashCtx } from "./registry";
import { computeDashboard } from "./compute";
import { seedDataset } from "@/data/mock";
import { buildMaps, categoryTrends, dailySpend } from "@/lib/domain/selectors";
import { defaultLayout, type WidgetSize } from "@/store/ui";

describe("dashboard registry", () => {
  it("maps size to distinct column widths (small 1/4, medium 1/2, large full)", () => {
    expect(colSpan("small")).toBe("lg:col-span-1");
    expect(colSpan("medium")).toBe("md:col-span-2 lg:col-span-2");
    expect(colSpan("large")).toBe("md:col-span-2 lg:col-span-4");
  });

  it("has a renderer and a title for every widget in the default layout", () => {
    for (const { id } of defaultLayout) {
      expect(widgets[id], `missing renderer for "${id}"`).toBeTypeOf("function");
      expect(widgetTitles[id], `missing title for "${id}"`).toBeTruthy();
    }
  });

  it("does not define orphan renderers without a layout slot", () => {
    const layoutIds = new Set(defaultLayout.map((w) => w.id));
    for (const id of Object.keys(widgets)) {
      expect(layoutIds.has(id), `renderer "${id}" not in default layout`).toBe(true);
    }
  });
});

// Build a realistic context from the seed data, exactly like the page does.
function makeCtx(): DashCtx {
  const maps = buildMaps(seedDataset.accounts, seedDataset.categories);
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

describe("total widget no-budget hero", () => {
  it("shows 'Avg / day' but not 'Income' when there are no budgets", () => {
    const ctx = makeCtx();
    const noBudget: DashCtx = {
      ...ctx,
      d: computeDashboard({ ...seedDataset, budgets: [] }, "2025-03", "all", new Date("2025-03-31T12:00:00Z")),
    };
    render(<>{widgets.total(noBudget, "large")}</>);
    expect(screen.getByText("Avg / day")).toBeInTheDocument();
    expect(screen.queryByText("Income")).not.toBeInTheDocument();
  });
});

describe("every widget renders at every size", () => {
  const ctx = makeCtx();
  for (const { id } of defaultLayout) {
    for (const size of SIZES) {
      it(`${id} @ ${size} renders content without throwing`, () => {
        const { container, unmount } = render(<>{widgets[id](ctx, size)}</>);
        expect((container.textContent ?? "").trim().length).toBeGreaterThan(0);
        unmount();
      });
    }
  }
});
