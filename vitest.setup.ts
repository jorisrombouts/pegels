import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// next-auth imports next/server without an extension, which vitest can't resolve under ESM.
// Stub the auth seam so the real next-auth module is never imported during tests.
// NOTE: this means component/action tests always run as "user-stub". Auth integration
// (allowlist, session expiry) must be verified via manual smoke tests, not this suite.
vi.mock("@/lib/auth", () => ({
  getUserId: async () => "user-stub",
}));

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

// Component tests now reach @/app/actions/ai (training-set capture). Its real module
// imports @/lib/db/queries → @/lib/db (Neon client), whose neon() throws at import when
// DATABASE_URL is unset. Stub the action: writes are inert, the feedback fetch returns [].
vi.mock("@/app/actions/ai", () => {
  const noop = async () => {};
  return {
    categorizeTransactions: async () => [],
    logImportExamples: noop,
    logDetailCorrection: noop,
    logDetailApproval: noop,
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
