import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import { PAGE_SIZES, type PageSize, type TableSearch } from "#/lib/table-search";

/**
 * Cursor pagination controls.
 *
 * Deliberately says "N shown" rather than "N of M". No clc-core list endpoint
 * returns a total, so any "of M" would be invented, and `mightHaveMore` is a
 * suggestion from a full page rather than proof another page exists — hence
 * "Next" is offered but nothing claims how many pages remain.
 */
export function TablePagination({
  search,
  shown,
  dropped,
  isFirstPage,
  mightHaveMore,
  isFetching,
  onFirstPage,
  onPreviousPage,
  onNextPage,
  onPageSize,
}: {
  search: TableSearch;
  shown: number;
  /** Rows the backend sent that normalization rejected, for this page only. */
  dropped: number;
  isFirstPage: boolean;
  mightHaveMore: boolean;
  isFetching: boolean;
  onFirstPage: () => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onPageSize: (perPage: PageSize) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="font-data text-xs text-muted-foreground">
          {shown} shown
          {dropped > 0 ? ` · ${dropped} dropped from this page` : ""}
        </span>
        <label className="flex items-center gap-2 font-mono text-xs text-muted-foreground uppercase">
          rows
          <select
            value={search.perPage}
            onChange={(event) => onPageSize(Number(event.target.value) as PageSize)}
            className="h-7 border border-border bg-card px-1 font-data text-xs text-foreground"
            aria-label="Rows per page"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="xs" onClick={onFirstPage} disabled={isFirstPage}>
          First
        </Button>
        <Button
          variant="outline"
          size="icon-xs"
          onClick={onPreviousPage}
          disabled={isFirstPage || isFetching}
          aria-label="Previous page"
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          variant="outline"
          size="icon-xs"
          onClick={onNextPage}
          disabled={!mightHaveMore || isFetching}
          aria-label="Next page"
        >
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );
}
