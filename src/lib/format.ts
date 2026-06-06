/** Swedish locale formatting (PRD §3.4): `12 450,00 kr`, sv-SE, 2 decimals. */

const sek = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const MASK = "•••• kr";

/**
 * Format a SEK amount. When `masked`, returns the privacy placeholder.
 * Negative amounts render with a leading minus, matching the UI ("−24 587 kr").
 */
export function formatSEK(amount: number, masked = false): string {
  if (masked) return MASK;
  return sek.format(amount);
}

/** Absolute SEK (no sign) — used where the sign is implied by context. */
export function formatSEKAbs(amount: number, masked = false): string {
  if (masked) return MASK;
  return sek.format(Math.abs(amount));
}

/** Parse a user-typed kronor amount ("100,75", "100.75", "1 200", "75 kr") → number. */
export function parseKronor(input: string): number {
  const cleaned = input
    .replace(/\s|kr/gi, "")
    .replace(/−/g, "-")
    .replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Percentage like "+171%" / "−4%" with an explicit sign. */
export function formatSignedPct(value: number): string {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${Math.abs(rounded)}%`;
}

/** "yyyy-mm" key for a date. */
export function monthKey(date: Date | string): string {
  // Transaction dates are ISO "yyyy-mm-dd" strings — slice directly. This is the hot path (called once
  // per transaction in nearly every selector) and also avoids the `new Date("yyyy-mm-dd")` UTC-parse /
  // local-getter mismatch that can shift the month near boundaries.
  if (typeof date === "string") return date.slice(0, 7);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const monthLabelFmt = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
/** "March 2025" for chrome (English UI). */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return monthLabelFmt.format(new Date(y, m - 1, 1));
}

const dayFmt = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short" });
/** "1 mars" — transaction dates stay Swedish (PRD §3.4). */
export function dayLabel(date: string): string {
  return dayFmt.format(new Date(date));
}
