import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithData } from "@/test/render";
import { DismissedList } from "./dismissed-list";
import type { CurationRow } from "@/lib/corpus/types";

let seq = 0;
const row = (description: string, o: Partial<CurationRow> = {}): CurationRow => ({
  id: `ex-${++seq}`,
  dedupKey: description.toLowerCase(),
  cleanedDescription: description,
  amount: -120,
  finalKind: "expense",
  finalCategoryId: null,
  finalTagIds: [],
  hitCount: 3,
  lastSeenAt: "2026-06-01",
  status: "rejected",
  source: "import",
  createdAt: "2026-06-01",
  embedded: true,
  ...o,
});

describe("DismissedList", () => {
  it("renders nothing at all when nothing has been dismissed", () => {
    const { container } = renderWithData(<DismissedList rows={[]} onRestore={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("stays collapsed until asked, so the healthy case is out of the way", async () => {
    const user = userEvent.setup();
    renderWithData(<DismissedList rows={[row("SKRÄPPOST")]} onRestore={() => {}} />);
    expect(screen.queryByText("SKRÄPPOST")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /1 hidden · view/ }));
    expect(screen.getByText("SKRÄPPOST")).toBeInTheDocument();
  });

  it("puts a dismissed merchant back into the review queue", async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn();
    const junk = row("SKRÄPPOST");
    renderWithData(<DismissedList rows={[junk]} onRestore={onRestore} />);
    await user.click(screen.getByRole("button", { name: /view/ }));
    await user.click(screen.getByRole("button", { name: /Bring SKRÄPPOST back/ }));
    expect(onRestore).toHaveBeenCalledWith(junk.id);
  });
});
