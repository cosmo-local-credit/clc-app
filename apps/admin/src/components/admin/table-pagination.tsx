import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import { ButtonGroup, ButtonGroupText } from "#/components/ui/button-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { PAGE_SIZES, type PageSize, type TableSearch } from "#/lib/table-search";

/**
 * Cursor pagination controls, flush under a `DataTable` footer.
 *
 * `mightHaveMore` is a suggestion from a full page rather than proof another
 * page exists — Next is offered only then, and nothing claims how many pages
 * remain. Dead siblings are omitted rather than shown disabled.
 */
export function TablePagination({
  search,
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
  const showFirst = !isFirstPage;
  const showPrev = !isFirstPage;
  const showNext = mightHaveMore;

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <ButtonGroup>
          <ButtonGroupText className="h-8 border-border px-2.5">Rows</ButtonGroupText>
          <Select
            value={String(search.perPage)}
            onValueChange={(value) => {
              if (value == null) return;
              const n = Number(value);
              if (PAGE_SIZES.includes(n as PageSize)) onPageSize(n as PageSize);
            }}
          >
            <SelectTrigger
              size="default"
              className="h-8 min-h-8 w-20 min-w-20 rounded-none px-2.5"
              aria-label="Rows per page"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              {PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ButtonGroup>
        {dropped > 0 ? (
          <span className="font-data text-sm text-muted-foreground tabular-nums">
            {dropped} dropped from this page
          </span>
        ) : null}
      </div>
      {showFirst || showPrev || showNext ? (
        <ButtonGroup>
          {showFirst ? (
            <Button variant="outline" size="sm" disabled={isFetching} onClick={onFirstPage}>
              First
            </Button>
          ) : null}
          {showPrev ? (
            <Button
              variant="outline"
              size="sm"
              disabled={isFetching}
              onClick={onPreviousPage}
              aria-label="Previous page"
            >
              <ChevronLeftIcon />
              Previous
            </Button>
          ) : null}
          {showNext ? (
            <Button
              variant="outline"
              size="sm"
              disabled={isFetching}
              onClick={onNextPage}
              aria-label="Next page"
            >
              Next
              <ChevronRightIcon />
            </Button>
          ) : null}
        </ButtonGroup>
      ) : null}
    </div>
  );
}
