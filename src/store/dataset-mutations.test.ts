import { describe, expect, it } from "vitest";
import * as M from "./dataset-mutations";
import { seedDataset } from "@/data/mock";
import type { Dataset } from "@/data/mock";

const base = (): Dataset => structuredClone(seedDataset);

describe("dataset-mutations", () => {
  it("emptyDataset has every array empty", () => {
    expect(Object.values(M.emptyDataset).every((a) => Array.isArray(a) && a.length === 0)).toBe(true);
  });

  it("upsertCategory adds then updates by id, without mutating the input", () => {
    const d = base();
    const added = M.applyUpsertCategory(d, { id: "c-new", name: "N", icon: "x", color: "0 0% 0%", parentId: null });
    expect(added.categories).toHaveLength(d.categories.length + 1);
    expect(d.categories.some((c) => c.id === "c-new")).toBe(false); // input untouched
    const updated = M.applyUpsertCategory(added, { id: "c-new", name: "N2", icon: "x", color: "0 0% 0%", parentId: null });
    expect(updated.categories).toHaveLength(added.categories.length);
    expect(updated.categories.find((c) => c.id === "c-new")?.name).toBe("N2");
  });

  it("removeCategory deletes it and detaches its transactions", () => {
    const d = base();
    expect(d.transactions.some((t) => t.categoryId === "cat-groceries")).toBe(true);
    const out = M.applyRemoveCategory(d, "cat-groceries");
    expect(out.categories.some((c) => c.id === "cat-groceries")).toBe(false);
    expect(out.transactions.some((t) => t.categoryId === "cat-groceries")).toBe(false);
  });

  it("removeTag deletes it and strips it from every transaction", () => {
    const d = base();
    const id = "tag-subscription";
    expect(d.transactions.some((t) => t.tagIds.includes(id))).toBe(true);
    const out = M.applyRemoveTag(d, id);
    expect(out.tags.some((t) => t.id === id)).toBe(false);
    expect(out.transactions.some((t) => t.tagIds.includes(id))).toBe(false);
  });

  it("applyUpdateTransaction patches one tx immutably", () => {
    const d = base();
    const id = d.transactions[0].id;
    const out = M.applyUpdateTransaction(d, id, { notes: "hello" });
    expect(out.transactions.find((t) => t.id === id)?.notes).toBe("hello");
    expect(d.transactions.find((t) => t.id === id)?.notes).toBeUndefined();
  });

  it("applyAddTransaction prepends", () => {
    const d = base();
    const tx = { ...d.transactions[0], id: "tx-zzz" };
    const out = M.applyAddTransaction(d, tx);
    expect(out.transactions[0].id).toBe("tx-zzz");
    expect(out.transactions).toHaveLength(d.transactions.length + 1);
  });

  it("applyRemoveTransaction deletes one tx immutably", () => {
    const d = base();
    const id = d.transactions[0].id;
    const out = M.applyRemoveTransaction(d, id);
    expect(out.transactions.some((t) => t.id === id)).toBe(false);
    expect(out.transactions).toHaveLength(d.transactions.length - 1);
    expect(d.transactions.some((t) => t.id === id)).toBe(true); // input untouched
  });
});
