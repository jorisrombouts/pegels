import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CalendarHeatmap, type DaySpend } from "./calendar-heatmap";

const days: DaySpend[] = Array.from({ length: 31 }, (_, i) => ({ day: i + 1, amount: i === 0 ? 12500 : i * 30 }));

describe("CalendarHeatmap", () => {
  it("renders Mon-first weekday headers and a cell per day", () => {
    render(<CalendarHeatmap month="2025-03" days={days} size="medium" />);
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.getAllByText("T")).toHaveLength(2); // Tue + Thu
    expect(screen.getAllByText("S")).toHaveLength(2); // Sat + Sun
    expect(screen.getByText("31")).toBeInTheDocument();
  });

  it("shows the busiest-day footer at medium but not at small", () => {
    const { rerender } = render(<CalendarHeatmap month="2025-03" days={days} size="medium" />);
    expect(screen.getByText(/Busiest: day 1/)).toBeInTheDocument();
    rerender(<CalendarHeatmap month="2025-03" days={days} size="small" />);
    expect(screen.queryByText(/Busiest/)).not.toBeInTheDocument();
  });
});
