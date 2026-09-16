import { derivePageCursors } from "@clc/api/client/cursor-page";
import type { SortingState } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import {
  firstPageSearch,
  isFirstPage,
  nextPageSearch,
  type PageSize,
  pageSizeSearch,
  previousPageSearch,
  sortSearch,
  type TableSearch,
} from "#/lib/table-search";

/**
 * Turns a route's search params plus one fetched page into everything a paged
 * table needs.
 *
 * Navigation goes through the caller's `navigate` so each step pushes history:
 * Back returns an operator to the page they were reading, which is the whole
 * point of keeping this state in the URL. Replacement is reserved for
 * normalization, which `parseTableSearch` already handles on entry.
 */
export function usePagedTable<T extends TableSearch>({
  search,
  page,
  navigate,
}: {
  search: T;
  /** The fetched page's cursor bounds, or undefined while loading or failed. */
  page: { first?: number; last?: number; receivedCount: number } | undefined;
  navigate: (search: T) => void;
}) {
  const atStart = isFirstPage(search);

  const cursors = useMemo(
    () =>
      page
        ? derivePageCursors(page, search.perPage, atStart)
        : { nextCursor: undefined, previousCursor: undefined, mightHaveMore: false },
    [page, search.perPage, atStart],
  );

  const sorting = useMemo<SortingState>(
    () => (search.sort ? [{ id: search.sort, desc: search.order === "desc" }] : []),
    [search.sort, search.order],
  );

  return {
    sorting,
    isFirstPage: atStart,
    mightHaveMore: cursors.mightHaveMore,
    onSortChange: useCallback(
      (columnId: string) => navigate(sortSearch(search, columnId)),
      [navigate, search],
    ),
    onFirstPage: useCallback(() => navigate(firstPageSearch(search)), [navigate, search]),
    onNextPage: useCallback(() => {
      if (cursors.nextCursor === undefined) return;
      navigate(nextPageSearch(search, cursors.nextCursor));
    }, [navigate, search, cursors.nextCursor]),
    onPreviousPage: useCallback(() => {
      // Stepping back from page two lands on the unparameterized first page
      // rather than a cursor that would re-derive it.
      if (cursors.previousCursor === undefined) return;
      navigate(previousPageSearch(search, cursors.previousCursor));
    }, [navigate, search, cursors.previousCursor]),
    onPageSize: useCallback(
      (perPage: PageSize) => navigate(pageSizeSearch(search, perPage)),
      [navigate, search],
    ),
  };
}
