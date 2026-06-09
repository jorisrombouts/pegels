/** Revolut statement support, layered on top of the generic CSV parser. */

import { parseAmount, parseDate, cleanDescription, type ParsedCsv } from "./parse-csv";
import type { TransactionKind } from "./domain/types";

export interface RevolutRow {
  date: string;
  description: string;
  amount: number; // effective: Amount − Fee, in `currency`
  currency: string; // ISO code from the Currency column, upper-cased (e.g. "EUR"); "SEK" if missing
  kind: TransactionKind | null; // null = unknown Type → caller sign-falls-back + categorizes
}

// Revolut localizes both its column headers and its cell values to the account's language.
// Each canonical field/value maps to the variants we've actually seen (English + Dutch);
// add more languages here as they turn up.
const HEADERS = {
  type: ["type"],
  started: ["started date", "startdatum"],
  description: ["description", "beschrijving"],
  amount: ["amount", "bedrag"],
  fee: ["fee", "kosten"],
  currency: ["currency", "valuta"],
  state: ["state", "status"],
} satisfies Record<string, string[]>;
const REQUIRED_FIELDS = ["type", "amount", "fee", "state"] as const; // header signature
const COMPLETED = new Set(["completed", "voltooid"]); // only completed rows are imported
const DROP_TYPES = new Set(["topup", "exchange", "geld toevoegen", "wisselen"]); // internal movements, never imported

// Known Revolut types → kind. transfer skips the LLM (categoryId null, not counted);
// expense is categorized normally. Types absent here fall through to a sign-based kind.
const TYPE_KIND: Record<string, TransactionKind> = {
  transfer: "transfer",
  overschrijving: "transfer",
  "card payment": "expense",
  kaartbetaling: "expense",
  charge: "expense",
};

/** Find a column by canonical field, accepting any known (English/Dutch) header alias. */
function colIndex(headers: string[], field: keyof typeof HEADERS): number {
  const names: readonly string[] = HEADERS[field];
  return headers.findIndex((h) => names.includes(h.trim().toLowerCase()));
}

/** A Revolut export carries Type + Amount + Fee + State columns; no SEB export does. */
export function isRevolutCsv(headers: string[]): boolean {
  return REQUIRED_FIELDS.every((f) => colIndex(headers, f) >= 0);
}

/**
 * Turn a parsed Revolut CSV into import-ready rows: keep only COMPLETED rows,
 * drop top-ups and exchanges, fold the Fee into the amount, and read the kind
 * from the Type column. Columns are located by header name (not the generic
 * 3-column mapping, which has no concept of Type/Fee/State).
 */
export function normalizeRevolut(parsed: ParsedCsv): RevolutRow[] {
  const h = parsed.headers;
  const iType = colIndex(h, "type");
  const iStarted = colIndex(h, "started");
  const iDesc = colIndex(h, "description");
  const iAmount = colIndex(h, "amount");
  const iFee = colIndex(h, "fee");
  const iCurrency = colIndex(h, "currency");
  const iState = colIndex(h, "state");

  return parsed.rows
    .filter((r) => COMPLETED.has((r[iState] ?? "").trim().toLowerCase()))
    .filter((r) => !DROP_TYPES.has((r[iType] ?? "").trim().toLowerCase()))
    .map((r) => {
      const type = (r[iType] ?? "").trim().toLowerCase();
      const amount = parseAmount(r[iAmount] ?? "");
      const fee = parseAmount(r[iFee] ?? ""); // non-negative cost
      const currency = (iCurrency >= 0 ? (r[iCurrency] ?? "") : "").trim().toUpperCase() || "SEK";
      return {
        date: parseDate(r[iStarted] ?? ""),
        description: cleanDescription(r[iDesc] ?? ""),
        amount: Math.round((amount - fee) * 100) / 100, // fold the fee in
        currency,
        kind: type in TYPE_KIND ? TYPE_KIND[type] : null,
      };
    });
}
