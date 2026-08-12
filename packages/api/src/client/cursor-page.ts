/**
 * Cursor semantics for clc-core's paged endpoints.
 *
 * A page response carries `first` and `last` — the cursor bounds of the rows it
 * returned — plus `receivedCount`, the rows the backend sent before defensive
 * normalization dropped any. Bidirectional navigation is built from those three.
 *
 * This lives beside the transport because it is knowledge about the endpoints,
 * not about any one screen: two apps paging the same resource must agree on what
 * "there might be another page" means.
 */

export type PageBounds = {
  /** Cursor bound of the first row in this page, used to step backwards. */
  first?: number;
  /** Cursor bound of the last row in this page, used to step forwards. */
  last?: number;
  /** Rows the backend sent, before normalization dropped malformed ones. */
  receivedCount: number;
};

export type PageCursors = {
  /** Cursor for the next page, or undefined when this is the last one. */
  nextCursor: number | undefined;
  /** Cursor for the previous page, or undefined when at the start. */
  previousCursor: number | undefined;
  /**
   * Deliberately not `hasNextPage`.
   *
   * A full page means the backend had at least as many rows as we asked for; it
   * does not prove another page exists, and no endpoint returns a total. Naming
   * it `hasNextPage` would invite the UI to state a fact it does not have. The
   * next request may legitimately come back empty.
   */
  mightHaveMore: boolean;
};

/**
 * @param atStart whether the caller is on the first page — no cursor applied yet.
 */
export function derivePageCursors(
  page: PageBounds,
  perPage: number,
  atStart: boolean,
): PageCursors {
  const mightHaveMore = page.receivedCount >= perPage && page.last !== undefined;

  return {
    nextCursor: mightHaveMore ? page.last : undefined,
    // There is nothing before the first page, and a page the backend gave no
    // lower bound for cannot be stepped back from.
    previousCursor: atStart ? undefined : page.first,
    mightHaveMore,
  };
}
