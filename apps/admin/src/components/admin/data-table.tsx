import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import { cn } from "#/lib/utils";

/**
 * Sortable table over a fully-loaded page of rows.
 *
 * Sorting reorders **the fetched page only**. No clc-core list endpoint accepts a
 * sort, so ordering cannot be applied across the whole resource; callers must say
 * so next to the table rather than let an operator read one page's ordering as the
 * resource's. When an endpoint gains a sort parameter, move `sort`/`order` into
 * the request and drop `getSortedRowModel`.
 *
 * Sort state is owned by the caller — normally the route's search params — so the
 * URL describes the view and Back restores it. An uncontrolled table would reset
 * its ordering on every navigation.
 *
 * `onRowClick` is a **mouse convenience only**. A row is not an interactive
 * element: it takes no focus, answers no keyboard, and cannot be opened in a new
 * tab. Any table whose rows navigate must also put a real `<Link>` in one cell —
 * that link is the accessible path to the detail screen, and the row handler
 * merely widens its hit area.
 */
export function DataTable<TData>({
  columns,
  data,
  sorting,
  onSortChange,
  onRowClick,
  emptyState,
  footer,
  className,
}: {
  columns: Array<ColumnDef<TData>>;
  data: Array<TData>;
  /** Controlled sort state. Omit for an unsorted table. */
  sorting?: SortingState;
  /** Called with the column id whose header was activated. */
  onSortChange?: (columnId: string) => void;
  onRowClick?: (row: TData) => void;
  emptyState?: ReactNode;
  /** Flush bar under the table (pager, count). Omitted on empty-state. */
  footer?: ReactNode;
  className?: string;
}) {
  const table = useReactTable({
    data,
    columns,
    state: { sorting: sorting ?? [] },
    // The rows are sorted here, not upstream: no endpoint accepts a sort, so the
    // fetched page is reordered locally from the caller's sort state.
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (data.length === 0 && emptyState) return <>{emptyState}</>;

  return (
    <div className={cn("overflow-hidden border border-border bg-card", className)}>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const sortable = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead
                    key={header.id}
                    className="whitespace-nowrap"
                    // Without this a screen reader reads the header text and the
                    // arrow glyph but never says the column is sorted, or which way.
                    aria-sort={
                      sortable
                        ? sorted === "asc"
                          ? "ascending"
                          : sorted === "desc"
                            ? "descending"
                            : "none"
                        : undefined
                    }
                  >
                    {header.isPlaceholder ? null : sortable ? (
                      <button
                        type="button"
                        onClick={() => onSortChange?.(header.column.id)}
                        className="inline-flex items-center gap-1 outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === "asc" ? (
                          <ArrowUpIcon className="size-3" />
                        ) : sorted === "desc" ? (
                          <ArrowDownIcon className="size-3" />
                        ) : (
                          <ChevronsUpDownIcon className="size-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              className={cn(onRowClick && "cursor-pointer")}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {footer ? <div className="border-t border-border px-4 py-3">{footer}</div> : null}
    </div>
  );
}
