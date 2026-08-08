import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithData } from "@/test/render";
import type { AccuracyPoint } from "@/app/actions/accuracy";

const { history, measure } = vi.hoisted(() => ({ history: vi.fn(), measure: vi.fn() }));
vi.mock("@/app/actions/accuracy", () => ({
  accuracyHistory: () => history(),
  measureAccuracy: () => measure(),
}));

import { AccuracyCard } from "./accuracy-card";

const point = (accuracy: number, at: string): AccuracyPoint => ({
  at,
  sampled: 60,
  correct: Math.round(accuracy * 60),
  accuracy,
});

describe("AccuracyCard", () => {
  it("leads with the latest figure and says what it counted", async () => {
    history.mockResolvedValue([point(0.75, "2026-08-01"), point(0.85, "2026-08-08")]);
    renderWithData(<AccuracyCard />);
    expect(await screen.findByText("85%")).toBeInTheDocument();
    expect(screen.getByText(/51 of 60 places/)).toBeInTheDocument();
  });

  it("names the direction of travel rather than only the current number", async () => {
    history.mockResolvedValue([point(0.75, "2026-08-01"), point(0.85, "2026-08-08")]);
    renderWithData(<AccuracyCard />);
    expect(await screen.findByText(/↑ 10% since last time/)).toBeInTheDocument();
  });

  it("draws a well-formed path — no NaN from a flat or single-point history", async () => {
    history.mockResolvedValue([point(0.8, "2026-08-01"), point(0.8, "2026-08-02"), point(0.8, "2026-08-03")]);
    const { container } = renderWithData(<AccuracyCard />);
    await screen.findByText("80%");
    const d = container.querySelector("[data-sparkline] path")!.getAttribute("d")!;
    expect(d).not.toMatch(/NaN|Infinity/);
    expect(d.startsWith("M")).toBe(true);
  });

  it("hides the trend rather than drawing a line through one point", async () => {
    history.mockResolvedValue([point(0.9, "2026-08-08")]);
    const { container } = renderWithData(<AccuracyCard />);
    await screen.findByText("90%");
    expect(container.querySelector("[data-sparkline]")).toBeNull();
  });

  it("invites a first run when nothing has been measured", async () => {
    history.mockResolvedValue([]);
    renderWithData(<AccuracyCard />);
    expect(await screen.findByText(/Not measured yet/)).toBeInTheDocument();
  });
});
