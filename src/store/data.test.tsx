import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import * as api from "@/app/actions/data";
import { useData, DATASET_KEY } from "./data";
import { useUI } from "./ui";
import { makeTestClient } from "@/test/render";
import type { Dataset } from "@/data/mock";

// Server actions are mocked globally (vitest.setup.ts) so persistence is inert. These verify
// the Query-backed facade wiring: seeded reads + that each mutation applies its reducer to the
// cache. Assertions read the QueryClient cache directly (the facade's contract).
function setup() {
  const queryClient = makeTestClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useData(), { wrapper });
  const cache = () => queryClient.getQueryData<Dataset>(DATASET_KEY)!;
  return { result, cache };
}

describe("useData facade", () => {
  it("reads the seeded dataset", () => {
    const { result } = setup();
    expect(result.current.accounts.length).toBeGreaterThan(0);
    expect(result.current.transactions.length).toBeGreaterThan(0);
  });

  it("optimistically upserts a category into the cache", () => {
    const { result, cache } = setup();
    const before = cache().categories.length;
    act(() => result.current.upsertCategory({ id: "cat-new", name: "New", icon: "🆕", color: "0 0% 50%", parentId: null }));
    expect(cache().categories).toHaveLength(before + 1);
    expect(cache().categories.some((c) => c.id === "cat-new")).toBe(true);
  });

  it("removeCategory deletes it and detaches its transactions (cascade)", () => {
    const { result, cache } = setup();
    act(() => result.current.removeCategory("cat-groceries"));
    expect(cache().categories.some((c) => c.id === "cat-groceries")).toBe(false);
    expect(cache().transactions.some((t) => t.categoryId === "cat-groceries")).toBe(false);
  });

  it("clearData empties every array in the cache", () => {
    const { result, cache } = setup();
    act(() => result.current.clearData());
    expect(cache().transactions).toHaveLength(0);
    expect(cache().accounts).toHaveLength(0);
  });

  it("signals a failed persist instead of rolling back silently", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(api, "upsertCategory").mockRejectedValueOnce(new Error("network down"));
    useUI.setState({ saveFailed: false });
    const { result, cache } = setup();
    const before = cache().categories.length;
    await act(async () => {
      result.current.upsertCategory({ id: "cat-doomed", name: "Doomed", icon: "💥", color: "0 0% 50%", parentId: null });
    });
    expect(cache().categories).toHaveLength(before); // rolled back, as before
    expect(consoleError).toHaveBeenCalled();
    expect(useUI.getState().saveFailed).toBe(true);
    consoleError.mockRestore();
    useUI.setState({ saveFailed: false });
  });

  it("resetData repopulates the cache with the lazily-loaded sample dataset", async () => {
    const { result, cache } = setup();
    act(() => result.current.clearData());
    expect(cache().transactions).toHaveLength(0);
    await act(async () => {
      await result.current.resetData();
    });
    expect(cache().transactions.length).toBeGreaterThan(0);
    expect(cache().accounts.length).toBeGreaterThan(0);
  });
});
