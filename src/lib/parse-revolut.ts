/** Revolut statement support, layered on top of the generic CSV parser. */

import { parseAmount, parseDate, cleanDescription, type ParsedCsv } from "./parse-csv";
import type { TransactionKind } from "./domain/types";

export interface RevolutRow {
  date: string;
  description: string;
  amount: number; // effective: Amount − Fee
  kind: TransactionKind | null; // null = unknown Type → caller sign-falls-back + categorizes
}

const REQUIRED = ["type", "amount", "fee", "state"]; // header signature
const DROP_TYPES = new Set(["topup", "exchange"]); // internal movements, never imported

// Known Revolut types → kind. transfer skips the LLM (categoryId null, not counted);
// expense is categorized normally. Types absent here fall through to a sign-based kind.
const TYPE_KIND: Record<string, TransactionKind> = {
  transfer: "transfer",
  "card payment": "expense",
  charge: "expense",
};

/** A Revolut export carries Type + Amount + Fee + State columns; no SEB export does. */
export function isRevolutCsv(headers: string[]): boolean {
  const lower = headers.map((h) => h.trim().toLowerCase());
  return REQUIRED.every((h) => lower.includes(h));
}

function colIndex(headers: string[], name: string): number {
  return headers.findIndex((h) => h.trim().toLowerCase() === name);
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
  const iStarted = colIndex(h, "started date");
  const iDesc = colIndex(h, "description");
  const iAmount = colIndex(h, "amount");
  const iFee = colIndex(h, "fee");
  const iState = colIndex(h, "state");

  return parsed.rows
    .filter((r) => (r[iState] ?? "").trim().toUpperCase() === "COMPLETED")
    .filter((r) => !DROP_TYPES.has((r[iType] ?? "").trim().toLowerCase()))
    .map((r) => {
      const type = (r[iType] ?? "").trim().toLowerCase();
      const amount = parseAmount(r[iAmount] ?? "");
      const fee = parseAmount(r[iFee] ?? ""); // non-negative cost
      return {
        date: parseDate(r[iStarted] ?? ""),
        description: cleanDescription(r[iDesc] ?? ""),
        amount: Math.round((amount - fee) * 100) / 100, // fold the fee in
        kind: type in TYPE_KIND ? TYPE_KIND[type] : null,
      };
    });
}
