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

const point = (o: Partial<AccuracyPoint> & { at: string }): AccuracyPoint => ({
  sampled: 60,
  correct: 21,
  correctSeen: 57,
  txTotal: 100,
  txCovered: 80,
  misses: [],
  ...o,
});

describe("AccuracyCard", () => {
  it("leads with the latest figure and says what it counted", async () => {
    history.mockResolvedValue([point({ at: "2026-08-01", txCovered: 60 }), point({ at: "2026-08-08" })]);
    renderWithData(<AccuracyCard />);
    expect(await screen.findByText("83%")).toBeInTheDocument();
    expect(screen.getByText(/expected on your next transaction/)).toBeInTheDocument();
  });

  it("names the direction of travel rather than only the current number", async () => {
    history.mockResolvedValue([point({ at: "2026-08-01", txCovered: 60 }), point({ at: "2026-08-08" })]);
    renderWithData(<AccuracyCard />);
    expect(await screen.findByText(/↑ 12%/)).toBeInTheDocument();
  });

  it("draws a well-formed path — no NaN from a flat or single-point history", async () => {
    history.mockResolvedValue([point({ at: "2026-08-01" }), point({ at: "2026-08-02" }), point({ at: "2026-08-03" })]);
    const { container } = renderWithData(<AccuracyCard />);
    await screen.findByText("83%");
    const d = container.querySelector("[data-sparkline] path")!.getAttribute("d")!;
    expect(d).not.toMatch(/NaN|Infinity/);
    expect(d.startsWith("M")).toBe(true);
  });

  it("hides the trend rather than drawing a line through one point", async () => {
    history.mockResolvedValue([point({ at: "2026-08-08" })]);
    const { container } = renderWithData(<AccuracyCard />);
    await screen.findByText("83%");
    expect(container.querySelector("[data-sparkline]")).toBeNull();
  });

  it("invites a first run when nothing has been measured", async () => {
    history.mockResolvedValue([]);
    renderWithData(<AccuracyCard />);
    expect(await screen.findByText(/Not measured yet/)).toBeInTheDocument();
  });
});
