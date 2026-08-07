import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ForecastWidget } from "./forecast-widget";
import type { CategoryForecast } from "@/lib/forecast/category-forecast";
import type { Category } from "@/lib/domain/types";

const housing: Category = { id: "cat-housing", name: "Housing", icon: "🏠", color: "0 0% 0%", parentId: null };
const food: Category = { id: "cat-food", name: "Food", icon: "🍽", color: "0 0% 0%", parentId: null };

function row(category: Category, o: Partial<CategoryForecast> = {}): CategoryForecast {
  return {
    category,
    landed: 1000, recurringLanded: 0, recurringExpected: 0, recurringLate: [],
    variableLanded: 1000, variablePace: 100, variableProjected: 500,
    projected: 1500, baseline: 1400, vsBaselinePct: 7.1,
    dailyAllowance: 40, verdict: "on-track", isProjected: true,
    ...o,
  };
}

describe("ForecastWidget", () => {
  it("names each category and what it is projected to reach", () => {
    render(<ForecastWidget rows={[row(food, { projected: 3400 })]} masked={false} onNavigate={() => {}} />);
    expect(screen.getByText("Food")).toBeInTheDocument();
    expect(screen.getByText(/3\s?400/)).toBeInTheDocument();
  });

  it("calls out a category trending over its typical month", () => {
    render(<ForecastWidget rows={[row(food, { verdict: "trending-over", projected: 3400, baseline: 2800 })]} masked={false} onNavigate={() => {}} />);
    expect(screen.getByText(/trending over/i)).toBeInTheDocument();
  });

  it("shows a fixed category as settled rather than offering a daily allowance", () => {
    render(<ForecastWidget rows={[row(housing, { verdict: "settled", dailyAllowance: null })]} masked={false} onNavigate={() => {}} />);
    expect(screen.getByText(/fixed/i)).toBeInTheDocument();
    expect(screen.queryByText(/\/day/)).not.toBeInTheDocument();
  });

  it("gives the remaining daily allowance for a steerable category", () => {
    render(<ForecastWidget rows={[row(food, { dailyAllowance: 190 })]} masked={false} onNavigate={() => {}} />);
    expect(screen.getByText(/190/)).toBeInTheDocument();
    expect(screen.getByText(/\/day left/)).toBeInTheDocument();
  });

  it("says there is not enough history rather than showing a made-up number", () => {
    render(<ForecastWidget rows={[row(food, { verdict: "no-basis", baseline: null, dailyAllowance: null })]} masked={false} onNavigate={() => {}} />);
    expect(screen.getByText(/too early/i)).toBeInTheDocument();
  });

  it("flags a recurring charge that has not arrived yet", () => {
    const late = [{ key: "hyra", label: "HYRA", categoryId: "cat-housing", typicalAmount: 12500, amountMad: 0, typicalDay: 1, occurrences: 6, distinctMonths: 6, confidence: 1 }];
    render(<ForecastWidget rows={[row(housing, { recurringLate: late })]} masked={false} onNavigate={() => {}} />);
    expect(screen.getByText(/HYRA/)).toBeInTheDocument();
    expect(screen.getByText(/hasn't landed/i)).toBeInTheDocument();
  });

  it("renders an empty state instead of a bare card", () => {
    render(<ForecastWidget rows={[]} masked={false} onNavigate={() => {}} />);
    expect(screen.getByText(/not enough/i)).toBeInTheDocument();
  });
});
