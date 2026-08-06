import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRatesToSEK } from "./fx";

afterEach(() => vi.restoreAllMocks());

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const fail = () => new Response("err", { status: 500 });

describe("fetchRatesToSEK", () => {
  it("returns SEK:1 without fetching when no foreign currency is requested", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    expect(await fetchRatesToSEK(["SEK", "sek"])).toEqual({ SEK: 1 });
    expect(spy).not.toHaveBeenCalled();
  });

  it("fetches SEK-base rates and inverts them to <currency>→SEK", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok({ base: "SEK", rates: { EUR: 0.1, USD: 0.05 } }));
    expect(await fetchRatesToSEK(["EUR", "USD"])).toEqual({ SEK: 1, EUR: 10, USD: 20 });
  });

  it("drops symbols that are not ISO-4217 codes", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok({ rates: { EUR: 0.1 } }));
    expect(await fetchRatesToSEK(["EUR", "USD&base=GBP"])).toEqual({ SEK: 1, EUR: 10 });
    expect(spy).toHaveBeenCalledWith("https://api.frankfurter.dev/v1/latest?base=SEK&symbols=EUR", expect.anything());
  });

  it("falls back to the second provider when the first errors", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(ok({ rates: { EUR: 0.2 } }));
    expect(await fetchRatesToSEK(["EUR"])).toEqual({ SEK: 1, EUR: 5 });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("throws when every provider fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(fail());
    await expect(fetchRatesToSEK(["EUR"])).rejects.toThrow();
  });
});
