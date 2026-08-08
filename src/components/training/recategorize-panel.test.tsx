import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithData } from "@/test/render";
import type { Category } from "@/lib/domain/types";
import type { RecategorizeChange } from "@/lib/corpus/recategorize";

const { preview, applyFn } = vi.hoisted(() => ({ preview: vi.fn(), applyFn: vi.fn() }));
vi.mock("@/app/actions/recategorize", () => ({
  previewRecategorize: (...a: unknown[]) => preview(...a),
  applyRecategorize: (...a: unknown[]) => applyFn(...a),
}));

import { RecategorizePanel } from "./recategorize-panel";

const CATEGORIES: Category[] = [
  { id: "cat-mortgage", name: "Mortgage", icon: "🏠", color: "0 0% 0%", parentId: null },
  { id: "cat-restaurants", name: "Restaurants", icon: "🍽", color: "0 0% 0%", parentId: null },
];

const change = (o: Partial<RecategorizeChange> = {}): RecategorizeChange => ({
  id: "t-1",
  description: "ATELJEE BAR",
  amount: -314.28,
  before: { kind: "expense", categoryId: "cat-mortgage", tagIds: [] },
  after: { kind: "expense", categoryId: "cat-restaurants", tagIds: [], confidence: 0.9, level: "high" },
  ...o,
});

async function previewWith(changes: RecategorizeChange[]) {
  preview.mockResolvedValue({ changes, unchanged: 2, truncated: false });
  const user = userEvent.setup();
  renderWithData(<RecategorizePanel categories={CATEGORIES} />);
  await user.click(screen.getByRole("button", { name: /Preview/ }));
  return user;
}

describe("RecategorizePanel", () => {
  beforeEach(() => {
    preview.mockReset();
    applyFn.mockReset().mockResolvedValue(1);
  });

  it("applies only the rows left ticked", async () => {
    const user = await previewWith([
      change({ id: "keep", description: "ATELJEE BAR" }),
      change({ id: "drop", description: "MS SILJA SERENADE" }),
    ]);
    await user.click(await screen.findByRole("checkbox", { name: /MS SILJA SERENADE/ }));
    expect(screen.getByRole("button", { name: /Apply 1 change$/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Apply 1 change$/ }));
    expect(applyFn).toHaveBeenCalledWith([expect.objectContaining({ id: "keep" })]);
  });

  it("cannot apply when everything is unticked", async () => {
    const user = await previewWith([change()]);
    await user.click(screen.getByRole("button", { name: "Untick all" }));
    expect(screen.getByRole("button", { name: /Apply 0 changes/ })).toBeDisabled();
  });

  // The screenshot case: category identical on both sides, so the old preview rendered
  // "Mortgage → Mortgage" and gave no reason for the row being listed at all.
  it("names the field that actually changed when the category is untouched", async () => {
    await previewWith([
      change({
        description: "LÅN 47567289",
        before: { kind: "expense", categoryId: "cat-mortgage", tagIds: [] },
        after: { kind: "expense", categoryId: "cat-mortgage", tagIds: ["tag-fixed"], confidence: 0.9, level: "high" },
      }),
    ]);
    const row = (await screen.findByText("LÅN 47567289")).closest("li")!;
    expect(within(row).getByText(/tags: no tags/)).toBeInTheDocument();
    expect(within(row).getByText("Fixed cost")).toBeInTheDocument();
    expect(within(row).queryByText(/category:/)).not.toBeInTheDocument();
  });

  it("shows a type change as its own line", async () => {
    await previewWith([
      change({
        description: "REVOLUT",
        before: { kind: "expense", categoryId: null, tagIds: [] },
        after: { kind: "transfer", categoryId: null, tagIds: [], confidence: 0.9, level: "high" },
      }),
    ]);
    const row = (await screen.findByText("REVOLUT")).closest("li")!;
    expect(within(row).getByText(/type: expense/)).toBeInTheDocument();
  });
});
