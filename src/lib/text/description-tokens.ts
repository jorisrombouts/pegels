import { cleanDescription } from "@/lib/parse-csv";

/**
 * Shared cleaning for Swedish bank descriptions: strip everything that varies between two
 * appearances of the same merchant, and return what identifies it.
 *
 * Two callers build different keys on top of this and must stay independent:
 *  - `normalizeMerchant` (categorization corpus) keeps every token — two ICA stores are two merchants.
 *  - `recurringKey` (forecast) keeps the first three — "HYRA MARS" and "HYRA APRIL" are one bill.
 *
 * Only the cleaning is shared. Neither key may be used as a categorization short-circuit.
 */

/** Swedish month names, full and abbreviated — banks append these to recurring charges. */
const MONTHS = new Set([
  "januari", "februari", "mars", "april", "maj", "juni",
  "juli", "augusti", "september", "oktober", "november", "december",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "okt", "nov", "dec",
]);

/** Swedish bank chrome that says how the money moved, not who it went to. */
const NOISE = new Set(["autogiro", "betalning", "kortköp", "överföring"]);

export function descriptionTokens(description: string): string[] {
  return cleanDescription(description)
    .toLowerCase()
    .replace(/\d{2,}/g, "") // card refs and invoice numbers; a lone digit is part of the name (OKQ8, St1)
    .split(/\s+/)
    .filter((t) => t && !MONTHS.has(t) && !NOISE.has(t));
}
