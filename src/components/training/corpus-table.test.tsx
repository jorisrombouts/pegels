import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithData } from "@/test/render";
import { CorpusTable } from "./corpus-table";
import type { CurationRow } from "@/lib/corpus/types";
import type { Category, Tag } from "@/lib/domain/types";
import type { CorpusEdit } from "@/store/corpus";

const CATEGORIES: Category[] = [
  { id: "cat-groceries", name: "Groceries", icon: "🛒", color: "0 0% 0%", parentId: null },
];
const TAGS: Tag[] = [{ id: "tag-fixed", name: "Fixed cost", color: "0 0% 0%" }];

let seq = 0;
const row = (description: string, o: Partial<CurationRow> = {}): CurationRow => ({
  id: `ex-${++seq}`,
  dedupKey: description.toLowerCase(),
  cleanedDescription: description,
  amount: -487,
  finalKind: "expense",
  finalCategoryId: "cat-groceries",
  finalTagIds: [],
  hitCount: 1,
  lastSeenAt: "2025-06-01",
  status: "approved",
  gold: false,
  source: "import",
  createdAt: "2025-06-01",
  embedded: true,
  ...o,
});

const many = (n: number) => Array.from({ length: n }, (_, i) => row(`MERCHANT ${String(i).padStart(3, "0")}`));
const noop = () => {};
const table = (rows: CurationRow[], onEdit: (id: string, patch: CorpusEdit) => void = noop) => (
  <CorpusTable rows={rows} categories={CATEGORIES} tags={TAGS} onToggleGold={noop} onRemove={noop} onEdit={onEdit} />
);

describe("CorpusTable pagination", () => {
  it("shows one page at a time instead of the whole corpus", () => {
    renderWithData(table(many(60)));
    expect(screen.getByText("MERCHANT 000")).toBeInTheDocument();
    expect(screen.queryByText("MERCHANT 030")).not.toBeInTheDocument();
    expect(screen.getByText(/1–25 of 60 merchants/)).toBeInTheDocument();
  });

  it("moves to the next page", async () => {
    const user = userEvent.setup();
    renderWithData(table(many(60)));
    await user.click(screen.getByRole("button", { name: /next page/i }));
    expect(screen.getByText("MERCHANT 025")).toBeInTheDocument();
    expect(screen.queryByText("MERCHANT 000")).not.toBeInTheDocument();
    expect(screen.getByText(/26–50 of 60/)).toBeInTheDocument();
  });

  it("cannot page before the first or past the last", async () => {
    const user = userEvent.setup();
    renderWithData(table(many(30)));
    expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /next page/i }));
    expect(screen.getByRole("button", { name: /next page/i })).toBeDisabled();
  });

  it("hides the pager entirely when everything fits", () => {
    renderWithData(table(many(5)));
    expect(screen.queryByRole("button", { name: /next page/i })).not.toBeInTheDocument();
  });

  it("returns to the first page when a search narrows the list", async () => {
    const user = userEvent.setup();
    renderWithData(table([...many(40), row("SPOTIFY AB")]));
    await user.click(screen.getByRole("button", { name: /next page/i }));
    await user.type(screen.getByPlaceholderText("Search merchants…"), "spotify");
    expect(screen.getByText("SPOTIFY AB")).toBeInTheDocument();
  });
});

describe("CorpusTable editing", () => {
  it("keeps the controls hidden until a row is opened for editing", async () => {
    const user = userEvent.setup();
    renderWithData(table([row("HALLON")]));
    expect(screen.queryByRole("group", { name: /Type for HALLON/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit HALLON" }));
    expect(screen.getByRole("group", { name: /Type for HALLON/ })).toBeInTheDocument();
  });

  // Driving the Radix Select open is not possible here — jsdom lacks the pointer-capture APIs it
  // needs, and nothing else in this suite drives one. Assert it is present and showing the row's
  // current value; the kind→category interaction below covers the logic that is actually new.
  it("offers a category picker seeded with the row's current category", async () => {
    const user = userEvent.setup();
    renderWithData(table([row("HALLON", { finalCategoryId: "cat-groceries" })]));
    await user.click(screen.getByRole("button", { name: "Edit HALLON" }));
    expect(screen.getByRole("combobox", { name: "Category for HALLON" })).toHaveTextContent("Groceries");
  });

  it("clears the category when an approved row is reclassified as income", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const r = row("LÖN", { finalCategoryId: "cat-groceries" });
    renderWithData(table([r], onEdit));
    await user.click(screen.getByRole("button", { name: "Edit LÖN" }));
    await user.click(screen.getByRole("button", { name: "income" }));
    expect(onEdit).toHaveBeenCalledWith(r.id, { finalKind: "income", finalCategoryId: null });
  });
});
