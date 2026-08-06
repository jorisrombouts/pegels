"use server";

import { getUserId } from "@/lib/auth";
import { invertToSEK } from "@/lib/fx";

// ECB rates, free, no API key. Both providers answer { rates: { <code>: <per-1-SEK> } } for base=SEK,
// so the same invertToSEK turns either into <currency>→SEK. Tried in order; first success wins.
const PROVIDERS = [
  (symbols: string[]) => `https://api.frankfurter.dev/v1/latest?base=SEK&symbols=${symbols.join(",")}`,
  () => "https://open.er-api.com/v6/latest/SEK",
];

/** Live <currency>→SEK rates for the given currencies (today's ECB rates). SEK is always 1. */
export async function fetchRatesToSEK(currencies: string[]): Promise<Record<string, number>> {
  await getUserId();
  // ISO-4217 shape only: keeps caller input out of the provider query string.
  const symbols = [...new Set(currencies.map((c) => String(c).trim().toUpperCase()))].filter(
    (c) => c !== "SEK" && /^[A-Z]{3}$/.test(c),
  );
  if (symbols.length === 0) return { SEK: 1 };

  let lastErr: unknown;
  for (const buildUrl of PROVIDERS) {
    try {
      const res = await fetch(buildUrl(symbols), { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`FX provider returned ${res.status}`);
      const data = (await res.json()) as { rates?: Record<string, number> };
      if (!data.rates) throw new Error("FX response missing rates");
      return invertToSEK(data.rates);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Could not fetch exchange rates: ${lastErr instanceof Error ? lastErr.message : "unknown error"}`);
}
