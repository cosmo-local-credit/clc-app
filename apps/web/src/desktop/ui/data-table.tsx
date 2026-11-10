import { useLingui } from "@lingui/react/macro";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { RiArrowDownSLine, RiArrowUpSLine } from "react-icons/ri";

import { DESK_SELECTED } from "#/desktop/ui/page";
import { cn } from "#/lib/utils";

export type DeskColumn<Row> = {
  id: string;
  header: ReactNode;
  align?: "start" | "end";
  /** A CSS grid track, such as `1.4fr` or `8rem`. */
  width?: string;
  sortValue?: (row: Row) => string | number;
  cell: (row: Row) => ReactNode;
};

type SortState = { id: string; direction: "asc" | "desc" };

const HEADER_CELL =
  "flex h-10 min-w-0 items-center px-3.5 font-mono text-2xs tracking-[0.12em] whitespace-nowrap text-muted-foreground uppercase";

/**
 * A lightweight local table: table, row, columnheader and cell roles over a
 * CSS grid. The header sticks to the top of the canvas that scrolls it. A
 * sortable column is a button inside its header cell and reports `aria-sort`.
 *
 * Sorting reorders `rows`, which is whatever has loaded. Pass `partial` while
 * older pages may still arrive, so the table says that the order covers the
 * loaded rows only. A row is a button or the caller's link so J/K can focus
 * it; `onSelect` runs on focus, which is how the inspector follows the
 * keyboard without pushing a history entry per row.
 */
export function DeskTable<Row>({
  rows,
  columns,
  rowKey,
  selectedKey,
  onSelect,
  renderRow,
  empty,
  label,
  partial = false,
}: {
  rows: readonly Row[];
  columns: readonly DeskColumn<Row>[];
  rowKey: (row: Row) => string;
  selectedKey?: string | null;
  onSelect?: (row: Row) => void;
  renderRow?: (
    row: Row,
    props: { className: string; style: CSSProperties; "data-desktop-row": "" },
    cells: ReactNode,
  ) => ReactNode;
  empty?: ReactNode;
  label: string;
  /** More rows may still load, so a sort covers only what is here. */
  partial?: boolean;
}) {
  const { t } = useLingui();
  const [sort, setSort] = useState<SortState | null>(null);
  const ordered = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((entry) => entry.id === sort.id);
    if (!column?.sortValue) return rows;
    const value = column.sortValue;
    const copy = [...rows];
    copy.sort((left, right) => {
      const a = value(left);
      const b = value(right);
      const compared =
        typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
      return sort.direction === "asc" ? compared : -compared;
    });
    return copy;
  }, [columns, rows, sort]);
  const template = columns.map((column) => column.width ?? "minmax(0,1fr)").join(" ");
  const sorted =
    sort != null && columns.some((column) => column.id === sort.id && column.sortValue);

  return (
    <div className="min-w-0">
      <div className="min-w-0 border border-border bg-card" role="table" aria-label={label}>
        <div
          role="row"
          className="sticky top-0 z-10 grid border-border border-b bg-muted"
          style={{ gridTemplateColumns: template }}
        >
          {columns.map((column) => {
            const active = sort?.id === column.id ? sort.direction : null;
            const alignEnd = column.align === "end" && "justify-end text-end";
            if (!column.sortValue) {
              return (
                <div key={column.id} role="columnheader" className={cn(HEADER_CELL, alignEnd)}>
                  {column.header}
                </div>
              );
            }
            return (
              <div
                key={column.id}
                role="columnheader"
                aria-sort={
                  active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"
                }
                className="flex min-w-0"
              >
                <button
                  type="button"
                  className={cn(HEADER_CELL, "w-full hover:text-foreground", alignEnd)}
                  onClick={() =>
                    setSort((current) =>
                      current?.id !== column.id
                        ? { id: column.id, direction: "asc" }
                        : current.direction === "asc"
                          ? { id: column.id, direction: "desc" }
                          : null,
                    )
                  }
                >
                  <span className="inline-flex items-center gap-1">
                    {column.header}
                    {active === "asc" ? <RiArrowUpSLine aria-hidden="true" /> : null}
                    {active === "desc" ? <RiArrowDownSLine aria-hidden="true" /> : null}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
        {ordered.length === 0 ? (
          <div className="border-border border-t px-3.5 py-8 text-sm text-muted-foreground">
            {empty}
          </div>
        ) : (
          ordered.map((row) => {
            const key = rowKey(row);
            const selected = selectedKey != null && selectedKey === key;
            const rowProps = {
              className: cn(
                "grid min-h-10 w-full items-center border-border border-t py-2.5 text-start",
                selected ? DESK_SELECTED : "hover:bg-muted/60",
              ),
              style: { gridTemplateColumns: template } as CSSProperties,
              "data-desktop-row": "" as const,
            };
            const cells = columns.map((column) => (
              <span
                key={column.id}
                role="cell"
                className={cn(
                  "min-w-0 truncate px-3.5 text-sm",
                  column.align === "end" && "text-end",
                )}
              >
                {column.cell(row)}
              </span>
            ));
            if (renderRow) {
              return (
                <div key={key} role="row">
                  {renderRow(row, rowProps, cells)}
                </div>
              );
            }
            return (
              <button
                key={key}
                type="button"
                role="row"
                data-selected={selected ? "true" : undefined}
                onFocus={() => onSelect?.(row)}
                onClick={() => onSelect?.(row)}
                {...rowProps}
              >
                {cells}
              </button>
            );
          })
        )}
      </div>
      {partial && sorted ? (
        <p role="status" className="px-1 pt-2 text-xs text-muted-foreground">
          {t`Sorted within the ${ordered.length} rows loaded so far.`}
        </p>
      ) : null}
    </div>
  );
}
