/** Minimal, dependency-free CSV parsing tuned for Swedish bank exports. */

export type ColumnField = "date" | "description" | "amount";
export type ColumnMapping = Record<ColumnField, number>; // field -> column index

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  mapping: ColumnMapping;
}

/** Pick the delimiter by counting candidates in the header line. */
function detectDelimiter(headerLine: string): string {
  const counts = [";", ",", "\t"].map((d) => [d, headerLine.split(d).length] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 1 ? counts[0][0] : ",";
}

/** Split one CSV line, honoring double-quoted fields. */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === delimiter && !inQuotes) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

const HEADER_HINTS: Record<ColumnField, string[]> = {
  date: ["datum", "date", "bokför", "transaktionsdat"],
  description: ["text", "beskriv", "description", "narrative", "mottagare", "memo"],
  amount: ["belopp", "amount", "summa", "sum"],
};

function autoDetect(headers: string[]): ColumnMapping {
  const lower = headers.map((h) => h.toLowerCase());
  const find = (field: ColumnField, fallback: number) => {
    const idx = lower.findIndex((h) => HEADER_HINTS[field].some((hint) => h.includes(hint)));
    return idx === -1 ? fallback : idx;
  };
  // Prefer the first date-ish column, last amount-ish, and a text column for description.
  return {
    date: find("date", 0),
    description: find("description", Math.min(1, headers.length - 1)),
    amount: find("amount", headers.length - 1),
  };
}

export function parseCsv(text: string): ParsedCsv {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return { headers: [], rows: [], mapping: { date: 0, description: 1, amount: 2 } };
  const delimiter = detectDelimiter(lines[0]);
  const headers = splitLine(lines[0], delimiter);
  const rows = lines.slice(1).map((l) => splitLine(l, delimiter));
  return { headers, rows, mapping: autoDetect(headers) };
}

/**
 * Parse amounts in both Swedish-comma ("−12 500,00") and SEB dot-decimal
 * ("-3000.000", "-188.750") formats → 2-decimal number.
 */
export function parseAmount(raw: string): number {
  const normalized = raw.replace(/−/g, "-").replace(/kr/gi, ""); // unicode minus → ascii, strip currency
  let cleaned: string;
  if (normalized.includes(",")) {
    // Swedish decimal: spaces/dots are thousands separators, comma is decimal.
    cleaned = normalized
      .replace(/[\s ]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
  } else {
    // Dot format (SEB): spaces are thousands; keep only the last dot as decimal.
    const noSpaces = normalized.replace(/[\s ]/g, "");
    const lastDot = noSpaces.lastIndexOf(".");
    cleaned =
      lastDot === -1
        ? noSpaces
        : noSpaces.slice(0, lastDot).replace(/\./g, "") + noSpaces.slice(lastDot);
  }
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/**
 * Clean a SEB merchant description: strip a trailing "/YY-MM-DD" or
 * "/YYYY-MM-DD" and collapse internal whitespace.
 */
export function cleanDescription(raw: string): string {
  return raw
    .replace(/\s*\/\d{2,4}-\d{2}-\d{2}\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize a date cell to ISO yyyy-mm-dd (accepts yyyy-mm-dd or dd/mm/yyyy). */
export function parseDate(raw: string): string {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return s;
}
