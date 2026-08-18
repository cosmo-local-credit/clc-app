/**
 * Typed search params for every admin list route.
 *
 * The URL is the source of truth for what a table is showing. That makes an
 * operator's view linkable and, more importantly, makes Back and Forward restore
 * the exact page and ordering they were looking at — a table that silently resets
 * to page one on Back is worse than one that never paged.
 *
 * Hand-written parsers rather than a schema library, matching the convention in
 * apps/web/src/lib: they are pure, cheap to test, and normalize rather than throw
 * so a hand-edited URL degrades to a sane view instead of an error screen.
 */

/** Supported page sizes. An arbitrary `perPage` would let a URL request the world. */
export const PAGE_SIZES = [10, 25, 50, 100] as const;

export type PageSize = (typeof PAGE_SIZES)[number];

export const DEFAULT_PAGE_SIZE: PageSize = 10;

type SortOrder = "asc" | "desc";

/** Which direction the cursor was applied in; the same value means different pages. */
type CursorDirection = "next" | "prev";

export type TableSearch = {
  perPage: PageSize;
  /** Absent on the first page. */
  cursor?: number;
  dir?: CursorDirection;
  /** Column id. Validated against the table's sortable columns by the caller. */
  sort?: string;
  order?: SortOrder;
  /** Free-text filter. Callers decide what it matches. */
  q?: string;
};

export function parsePageSize(value: unknown): PageSize {
  const parsed = typeof value === "string" ? Number(value) : value;
  return PAGE_SIZES.find((size) => size === parsed) ?? DEFAULT_PAGE_SIZE;
}

function parseCursor(value: unknown): number | undefined {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isSafeInteger(parsed) || parsed < 0) return undefined;
  return parsed;
}

function parseDirection(value: unknown): CursorDirection | undefined {
  return value === "next" || value === "prev" ? value : undefined;
}

function parseOrder(value: unknown): SortOrder | undefined {
  return value === "asc" || value === "desc" ? value : undefined;
}

function parseSort(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Normalizes any search object into a usable table view.
 *
 * A cursor with no direction is meaningless, and a direction with no cursor names
 * no page, so the pair is kept together or dropped together. Likewise a sort
 * order without a column.
 */
export function parseTableSearch(search: Record<string, unknown>): TableSearch {
  const cursor = parseCursor(search.cursor);
  const dir = parseDirection(search.dir);
  const sort = parseSort(search.sort);

  const q = parseSearchText(search.q);
  return {
    perPage: parsePageSize(search.perPage),
    ...(cursor !== undefined && dir ? { cursor, dir } : {}),
    ...(sort ? { sort, order: parseOrder(search.order) ?? "asc" } : {}),
    ...(q ? { q } : {}),
  };
}

function parseSearchText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** Reset to the first page when a filter changes; keep size and sort. */
export function filterSearch<T extends TableSearch>(current: T, patch: Partial<T>): T {
  return { ...firstPageSearch(current), ...patch } as T;
}

/** Search for the first page, preserving page size and ordering. */
export function firstPageSearch<T extends TableSearch>(current: T): T {
  const { cursor: _cursor, dir: _dir, ...rest } = current;
  return rest as T;
}

export function nextPageSearch<T extends TableSearch>(current: T, cursor: number): T {
  return { ...current, cursor, dir: "next" };
}

export function previousPageSearch<T extends TableSearch>(current: T, cursor: number): T {
  return { ...current, cursor, dir: "prev" };
}

/**
 * Toggling a column resets to the first page.
 *
 * Sorting is applied to the fetched page only (no endpoint accepts a sort yet),
 * so keeping a cursor while re-sorting would present one arbitrary page's
 * ordering as the resource's ordering.
 */
export function sortSearch<T extends TableSearch>(current: T, column: string): T {
  const base = firstPageSearch(current);
  if (current.sort !== column) return { ...base, sort: column, order: "asc" };
  if (current.order === "asc") return { ...base, sort: column, order: "desc" };
  const { sort: _sort, order: _order, ...cleared } = base;
  return cleared as T;
}

/** Page-size changes invalidate any cursor, which was issued for the old size. */
export function pageSizeSearch<T extends TableSearch>(current: T, perPage: PageSize): T {
  return { ...firstPageSearch(current), perPage };
}

/** Whether the view is on the first page, which decides if Previous is offered. */
export function isFirstPage(search: TableSearch): boolean {
  return search.cursor === undefined;
}
