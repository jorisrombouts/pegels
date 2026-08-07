import { cleanDescription } from "@/lib/parse-csv";

/**
 * FORECAST-ONLY grouping key. Collapses the same repeat charge across months so it can be
 * read as a time series.
 *
 * Deliberately NOT shared with categorization: this key never influences a label, only whether
 * a charge looks recurring. Categorization retrieves its own neighbours and must not gain a
 * merchant-keyed memory by the back door.
 */

/** Swedish month names, full and abbreviated — banks append these to recurring charges. */
const MONTHS = new Set([
  "januari", "februari", "mars", "april", "maj", "juni",
  "juli", "augusti", "september", "oktober", "november", "december",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "okt", "nov", "dec",
]);

/** Swedish bank chrome that says how the money moved, not who it went to. */
const NOISE = new Set(["autogiro", "betalning", "kortköp", "överföring"]);

/** Swedish bank descriptions lead with the merchant and trail the variable part. */
const KEEP_TOKENS = 3;

export function recurringKey(description: string): string {
  return cleanDescription(description)
    .toLowerCase()
    .replace(/\d{2,}/g, "") // card refs and invoice numbers; a lone digit is part of the name (OKQ8, St1)
    .split(/\s+/)
    .filter((t) => t && !MONTHS.has(t) && !NOISE.has(t))
    .slice(0, KEEP_TOKENS)
    .join(" ");
}
