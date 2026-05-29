import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock the server actions globally: the real module imports the Neon client, whose neon()
// throws at import when DATABASE_URL is unset. loadDataset returns the seed; writes are
// inert (the useData facade still updates the Query cache optimistically before calling them).
vi.mock("@/app/actions/data", async () => {
  const { seedDataset } = await import("@/data/mock");
  const noop = async () => {};
  return {
    loadDataset: async () => seedDataset,
    upsertTransaction: noop, addTransactions: noop,
    upsertCategory: noop, removeCategory: noop,
    upsertTag: noop, removeTag: noop,
    upsertAccount: noop, removeAccount: noop,
    upsertBudget: noop, removeBudget: noop,
    upsertGoal: noop, removeGoal: noop,
    clearData: noop, resetData: noop,
  };
});

// jsdom has no matchMedia; next-themes (system mode) and useMediaQuery need it.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
