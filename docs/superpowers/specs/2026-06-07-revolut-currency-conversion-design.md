# Revolut import: convert non-SEK rows to SEK

**Date:** 2026-06-07
**Status:** Approved

## Problem

A Revolut export carries a `Currency` column per row. `normalizeRevolut` ignores it, so a
`€102.00` row is imported as `-102` and treated as 102 kr. The whole domain model is SEK-only
("All amounts are SEK"), so foreign-currency transactions are silently wrong.

## Decision

Convert non-SEK rows to SEK **at import time** using live ECB rates, then store SEK. The domain
model is unchanged — no schema change, no per-transaction currency, no in-app FX display. After
import everything is SEK and all existing totals/budgets keep working.

Scope: **any** non-SEK currency (EUR, USD, GBP, …), **today's** rate (not per-transaction-date).

## Architecture / data flow

1. `normalizeRevolut` reads the `Currency` column → each `RevolutRow` gains `currency: string`
   (upper-cased, e.g. `"EUR"`; defaults to `"SEK"` if the column is missing).
2. The import modal collects the set of distinct non-SEK currencies present in the parsed rows.
3. If that set is non-empty, it calls a new **server action** `fetchRatesToSEK(currencies)`:
   - `GET https://api.frankfurter.dev/v1/latest?base=SEK&symbols=EUR,USD,...` (ECB data, free, no key).
   - Response `{ rates: { EUR: 0.092, ... } }` is SEK→X, so invert: `rate(X→SEK) = 1 / rates[X]`.
   - Returns `{ EUR: 10.87, USD: 9.33, ... }` (plus `SEK: 1`). Fallback provider `open.er-api.com`
     (no key) if Frankfurter errors.
4. A **pure** helper `convertRowsToSEK(rows, ratesToSEK)`:
   - SEK rows pass through unchanged.
   - Non-SEK rows: `amountSEK = round2(amount * rate)`; append the original to the note as
     `"102.00 EUR @ 10.87"` (currency code, not symbol — no per-currency symbol map needed; uses the
     existing `notes` field, so no schema change).
   - A row whose currency has no rate (fetch failed / unknown symbol) is returned flagged
     `unconverted: true` so the modal can hold it back.
5. Converted SEK rows continue through the existing pipeline (dedup → categorize → store) untouched.

## Server action: `fetchRatesToSEK`

`src/app/actions/fx.ts` — `"use server"`. Input: `string[]` of currency codes (non-SEK). Output:
`Record<string, number>` of code→SEK. Runs server-side (no CORS, hideable, mockable). Network
fetch with a short timeout; throws on failure so the caller shows the error/retry path.

## Conversion logic

`src/lib/fx.ts` — pure, no I/O:
- `invertToSEK(frankfurterRates)` → code→SEK map.
- `convertRowsToSEK(rows, ratesToSEK)` → `{ rows: converted[], unconvertedCurrencies: string[] }`.
Pure functions are unit-tested directly; the network is only in the server action.

## Import-modal UX

- On detecting non-SEK rows, fetch rates and show a transparency line:
  *"Converting 7 non-SEK rows at today's ECB rate (1 EUR = 10.87 kr)."*
- **FX fetch failure (offline / API down):** show an error banner with **Retry**. The non-SEK rows
  appear in the preview marked *"needs exchange rate"* with `include = false` and can't be toggled
  on until a rate loads; **SEK rows import normally**. A network blip never blocks the whole import.
- Converted amounts are what the preview and dedup use (dedup key stays `date|amount|description`,
  now in SEK — consistent with stored transactions).

## Testing

- `parse-revolut`: reads `Currency`; missing column → `"SEK"`.
- `fx`: `invertToSEK` math; `convertRowsToSEK` conversion + öre rounding + SEK passthrough +
  note suffix + `unconvertedCurrencies` for a missing rate.
- Server action `fetchRatesToSEK`: fetch mocked — happy path inversion + Frankfurter→fallback.
- Import modal: non-SEK detection triggers conversion; failure holds back non-SEK rows, imports SEK.

## Out of scope (YAGNI)

No schema change; no per-transaction-date historical rates; no in-app multi-currency display;
no automatic re-conversion of already-imported rows.
