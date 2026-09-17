import type { ManagedReportPage } from "@clc/api/features/reports/client";
import type { SortingState } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";

import type { PageSize } from "#/lib/table-search";
import {
  isPostFirstPage,
  postFirstPageSearch,
  postNextPageSearch,
  postPageSizeSearch,
  postPreviousPageSearch,
  postSortSearch,
  type PostSearch,
} from "./post-search";

/**
 * The paging adapter for the post table.
 *
 * `usePagedTable` cannot serve this: it derives its cursors from one numeric id
 * with `derivePageCursors`, and this endpoint returns a compound `first`/`last`
 * pair instead. The callbacks it hands back are the same shape, so `DataTable`
 * and `TablePagination` are unchanged.
 *
 * `last` advances and `first` steps back, which is why the endpoint returns both
 * rather than the feed's single `next`.
 */
export function usePostTable({
  search,
  page,
  navigate,
}: {
  search: PostSearch;
  /** The fetched page, or undefined while loading or failed. */
  page: ManagedReportPage | undefined;
  navigate: (search: PostSearch) => void;
}) {
  const atStart = isPostFirstPage(search);

  // A full page suggests another one exists; it is not proof, so nothing here
  // claims a page count. Measured on rows the backend sent rather than rows that
  // survived normalization, or a page with one dropped row would end the walk.
  const mightHaveMore = page !== undefined && page.receivedCount >= search.perPage;

  const sorting = useMemo<SortingState>(
    () => (search.sort ? [{ id: search.sort, desc: search.order === "desc" }] : []),
    [search.sort, search.order],
  );

  return {
    sorting,
    isFirstPage: atStart,
    mightHaveMore,
    onSortChange: useCallback(
      (columnId: string) => navigate(postSortSearch(search, columnId)),
      [navigate, search],
    ),
    onFirstPage: useCallback(() => navigate(postFirstPageSearch(search)), [navigate, search]),
    onNextPage: useCallback(() => {
      if (!page?.last) return;
      navigate(postNextPageSearch(search, page.last));
    }, [navigate, search, page?.last]),
    onPreviousPage: useCallback(() => {
      if (!page?.first) return;
      navigate(postPreviousPageSearch(search, page.first));
    }, [navigate, search, page?.first]),
    onPageSize: useCallback(
      (perPage: PageSize) => navigate(postPageSizeSearch(search, perPage)),
      [navigate, search],
    ),
  };
}
