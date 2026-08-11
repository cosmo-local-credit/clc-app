import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
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
 * Sorting is client-side by design: every admin list here fetches one cursor
 * page at a time, so re-sorting server-side would cost a round trip to reorder
 * rows already in memory. When a surface grows past one page, move sorting into
 * the query params instead of paging this component.
 */
export function DataTable<TData>({
  columns,
  data,
  onRowClick,
  emptyState,
  className,
}: {
  columns: Array<ColumnDef<TData>>;
  data: Array<TData>;
  onRowClick?: (row: TData) => void;
  emptyState?: ReactNode;
  className?: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (data.length === 0 && emptyState) return <>{emptyState}</>;

  return (
    <div className={cn("overflow-x-auto border border-border bg-card", className)}>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const sortable = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead key={header.id} className="whitespace-nowrap">
                    {header.isPlaceholder ? null : sortable ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
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
    </div>
  );
}
