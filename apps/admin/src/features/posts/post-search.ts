import type { ManagedReportCursor } from "@clc/api/features/reports/client";
import { REPORT_STATUSES, type ReportStatus } from "@clc/core/features/reports/logic";

import { DEFAULT_PAGE_SIZE, type PageSize, parsePageSize } from "#/lib/table-search";

/**
 * Typed search params for the post moderation table.
 *
 * Hand-written beside `table-search.ts` rather than an extension of it, because
 * the cursor is a different thing. Every other admin list pages by one numeric
 * id; posts page by the `(updatedAt, id)` pair, because they are ordered by
 * activity and on the imported catalog that order is unrelated to id order. A
 * `TableSearch` cursor cannot express that, and widening it would give every
 * other table a second cursor shape to ignore.
 *
 * Page size and sort are reused from there: they mean the same thing here.
 */

/** The queue an operator opens by default. */
const DEFAULT_POST_STATUS: ReportStatus = "SUBMITTED";

/**
 * `ALL` is a URL-only sentinel, never a wire value.
 *
 * It exists because an omitted `status` means the default queue rather than
 * every status, so "show me everything" needs a value of its own. The client
 * drops it instead of sending it — clc-core would answer 400.
 */
export const POST_STATUS_FILTERS = [...REPORT_STATUSES, "ALL"] as const;

export type PostStatusFilter = (typeof POST_STATUS_FILTERS)[number];

export const POST_STATUS_LABELS: Record<PostStatusFilter, string> = {
  SUBMITTED: "Awaiting approval",
  APPROVED: "Approved",
  DRAFT: "Draft",
  REJECTED: "Not approved",
  ALL: "All",
};

/** The searchable term length clc-core accepts. A shorter one is a 400. */
const POST_TERM_MIN = 2;
const POST_TERM_MAX = 64;

type SortOrder = "asc" | "desc";

export type PostSearch = {
  perPage: PageSize;
  status: PostStatusFilter;
  q?: string;
  /** Exact author address; the backend compares it case-insensitively. */
  author?: string;
  /** Comma-separated tag values, as the catalog filter serializes them. */
  tags?: string;
  /** Comma-separated `chainId:0xAddress` references. */
  vouchers?: string;
  /** Both halves of the keyset position, or neither. */
  cursorUpdatedAt?: string;
  cursorId?: string;
  /** Which way the cursor was applied. The API's boolean `next` is mapped in the client. */
  dir?: "next" | "prev";
  sort?: string;
  order?: SortOrder;
};

/**
 * Normalizes any search object into a usable view.
 *
 * Normalizes rather than throws, so a hand-edited URL degrades to a sane table
 * instead of an error screen — the same contract as `parseTableSearch`.
 */
export function parsePostSearch(search: Record<string, unknown>): PostSearch {
  const cursorUpdatedAt = text(search.cursorUpdatedAt);
  // Coerced: the router's default parser reads `cursorId=4633` as a number, and
  // the cursor crosses the wire as text.
  const cursorId = text(search.cursorId) ?? numberText(search.cursorId);
  const sort = text(search.sort);
  // The raw term, not the normalized one. A one-character draft has to survive
  // in the URL so the box does not lose the character on re-seed; the request
  // filter is what drops it, so no guaranteed 400 is ever sent.
  const q = text(search.q);

  return {
    perPage: parsePageSize(search.perPage),
    status: parsePostStatusFilter(search.status),
    ...(q ? { q } : {}),
    ...(parseAuthor(search.author) ? { author: parseAuthor(search.author) } : {}),
    ...(text(search.tags) ? { tags: text(search.tags) } : {}),
    ...(text(search.vouchers) ? { vouchers: text(search.vouchers) } : {}),
    // A position needs both halves and a direction; clc-core answers 400 for
    // one alone, so a partial cursor is dropped rather than forwarded.
    ...(cursorUpdatedAt && cursorId && parseDirection(search.dir)
      ? { cursorUpdatedAt, cursorId, dir: parseDirection(search.dir) }
      : {}),
    ...(sort ? { sort, order: parseOrder(search.order) ?? "asc" } : {}),
  };
}

/** The queue as a link target: what `/posts` shows with no search params. */
export const DEFAULT_POST_SEARCH: PostSearch = {
  perPage: DEFAULT_PAGE_SIZE,
  status: DEFAULT_POST_STATUS,
};

export function parsePostStatusFilter(value: unknown): PostStatusFilter {
  return POST_STATUS_FILTERS.find((status) => status === value) ?? DEFAULT_POST_STATUS;
}

/**
 * The term as clc-core will accept it, or undefined.
 *
 * A one-character term is dropped rather than sent: the backend rejects it, and
 * a guaranteed 400 is not a search result. The URL keeps the raw draft, so the
 * field does not lose the character while it is too short to search.
 */
export function normalizePostTerm(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const collapsed = raw.trim().split(/\s+/).filter(Boolean).join(" ");
  // Array.from, not spread: a term with an emoji must count code points once.
  const points = Array.from(collapsed);
  if (points.length < POST_TERM_MIN) return undefined;
  return points.length <= POST_TERM_MAX ? collapsed : points.slice(0, POST_TERM_MAX).join("");
}

/** The status to send, or undefined for the `ALL` sentinel. */
export function postStatusParam(status: PostStatusFilter): ReportStatus | undefined {
  return status === "ALL" ? undefined : status;
}

/** The keyset position to send, or undefined on the first page. */
export function postCursorParam(search: PostSearch): ManagedReportCursor | undefined {
  if (!search.cursorUpdatedAt || !search.cursorId) return undefined;
  return { updatedAt: search.cursorUpdatedAt, id: search.cursorId };
}

/** The URL's direction as the API's boolean. Undefined without a cursor. */
export function postNextParam(search: PostSearch): boolean | undefined {
  if (!search.dir || !postCursorParam(search)) return undefined;
  return search.dir === "next";
}

export function isPostFirstPage(search: PostSearch): boolean {
  return search.cursorUpdatedAt === undefined;
}

/** Search for the first page, preserving the filters, page size and ordering. */
export function postFirstPageSearch(search: PostSearch): PostSearch {
  const { cursorUpdatedAt: _at, cursorId: _id, dir: _dir, ...rest } = search;
  return rest;
}

/** A filter change drops both cursor halves: they named a page of the old set. */
export function postFilterSearch(search: PostSearch, patch: Partial<PostSearch>): PostSearch {
  return { ...postFirstPageSearch(search), ...patch };
}

export function postNextPageSearch(search: PostSearch, cursor: ManagedReportCursor): PostSearch {
  return { ...search, cursorUpdatedAt: cursor.updatedAt, cursorId: cursor.id, dir: "next" };
}

export function postPreviousPageSearch(
  search: PostSearch,
  cursor: ManagedReportCursor,
): PostSearch {
  return { ...search, cursorUpdatedAt: cursor.updatedAt, cursorId: cursor.id, dir: "prev" };
}

/**
 * Toggling a column resets to the first page.
 *
 * Sorting applies to the fetched page only — no endpoint accepts a sort — so
 * keeping a cursor while re-sorting would present one page's ordering as the
 * resource's.
 */
export function postSortSearch(search: PostSearch, column: string): PostSearch {
  const base = postFirstPageSearch(search);
  if (search.sort !== column) return { ...base, sort: column, order: "asc" };
  if (search.order === "asc") return { ...base, sort: column, order: "desc" };
  const { sort: _sort, order: _order, ...cleared } = base;
  return cleared;
}

/** A page-size change invalidates a cursor issued for the old size. */
export function postPageSizeSearch(search: PostSearch, perPage: PageSize): PostSearch {
  return { ...postFirstPageSearch(search), perPage };
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function numberText(value: unknown): string | undefined {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
}

function parseAuthor(value: unknown): string | undefined {
  const raw = text(value);
  return raw && /^0x[0-9a-fA-F]{40}$/.test(raw) ? raw : undefined;
}

function parseDirection(value: unknown): "next" | "prev" | undefined {
  return value === "next" || value === "prev" ? value : undefined;
}

function parseOrder(value: unknown): SortOrder | undefined {
  return value === "asc" || value === "desc" ? value : undefined;
}
