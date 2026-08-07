export interface Page<T> {
  rows: T[];
  /** The page actually shown — clamped, which may differ from what was asked for. */
  page: number;
  pageCount: number;
  /** 1-based range of the rows shown, for "showing 26–50 of 112". Both 0 when empty. */
  from: number;
  to: number;
  total: number;
}

/**
 * Slice a list into a page, clamping the index into range.
 *
 * The clamp is the part that matters: the review queue shrinks as rows are approved, so the page
 * the user is on can stop existing underneath them. Returning an empty page there would look like
 * the work had vanished.
 */
export function paginate<T>(items: T[], page: number, pageSize: number): Page<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safe = Math.min(Math.max(page, 0), pageCount - 1);
  const start = safe * pageSize;
  const rows = items.slice(start, start + pageSize);
  return {
    rows,
    page: safe,
    pageCount,
    from: total === 0 ? 0 : start + 1,
    to: start + rows.length,
    total,
  };
}
