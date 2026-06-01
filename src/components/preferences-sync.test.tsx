import { act, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreferencesSync } from "./preferences-sync";
import { useUI, defaultLayout, defaultNavConfig } from "@/store/ui";
import { loadPreferences, savePreferences } from "@/app/actions/preferences";

vi.mock("@/app/actions/preferences", () => ({
  loadPreferences: vi.fn(),
  savePreferences: vi.fn(async () => {}),
}));

const SERVER = {
  layout: [{ id: "trend", size: "small" as const }],
  navConfig: [{ key: "home", primary: false }],
};

function renderSync() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PreferencesSync />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  act(() => useUI.setState({ layout: defaultLayout, navConfig: defaultNavConfig }));
});
afterEach(() => vi.useRealTimers());

describe("PreferencesSync", () => {
  it("hydrates the store from a server row", async () => {
    vi.mocked(loadPreferences).mockResolvedValue(SERVER);
    renderSync();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(useUI.getState().layout).toEqual(SERVER.layout);
    expect(useUI.getState().navConfig).toEqual(SERVER.navConfig);
  });

  it("does NOT save the just-hydrated value", async () => {
    vi.mocked(loadPreferences).mockResolvedValue(SERVER);
    renderSync();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(savePreferences).not.toHaveBeenCalled();
  });

  it("debounce-saves a later change", async () => {
    vi.mocked(loadPreferences).mockResolvedValue(SERVER);
    renderSync();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    act(() => useUI.getState().setWidgetSize("trend", "large"));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(savePreferences).toHaveBeenCalledTimes(1);
    expect(vi.mocked(savePreferences).mock.calls[0][0].layout).toEqual([{ id: "trend", size: "large" }]);
  });

  it("seeds on first change when there is no server row", async () => {
    vi.mocked(loadPreferences).mockResolvedValue(null);
    renderSync();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    act(() => useUI.getState().setWidgetSize("total", "medium"));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(savePreferences).toHaveBeenCalledTimes(1);
  });
});
