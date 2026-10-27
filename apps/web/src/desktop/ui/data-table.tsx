import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { RiArrowDownSLine, RiArrowUpSLine } from "react-icons/ri";

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

/**
 * One page, sorted here. A row is a button or the caller's link so J/K can
 * focus it. `onSelect` runs on focus, which is how the inspector follows the
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
}) {
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

  return (
    <div className="min-w-0 border border-border bg-card" role="table" aria-label={label}>
      <div
        role="row"
        className="grid border-border border-b bg-muted"
        style={{ gridTemplateColumns: template }}
      >
        {columns.map((column) => {
          const active = sort?.id === column.id ? sort.direction : null;
          const header = (
            <span className="inline-flex items-center gap-1">
              {column.header}
              {active === "asc" ? <RiArrowUpSLine aria-hidden="true" /> : null}
              {active === "desc" ? <RiArrowDownSLine aria-hidden="true" /> : null}
            </span>
          );
          return column.sortValue ? (
            <button
              key={column.id}
              type="button"
              role="columnheader"
              aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"}
              className={cn(
                "flex h-10 items-center px-3.5 font-mono text-2xs tracking-[0.12em] whitespace-nowrap text-muted-foreground uppercase",
                column.align === "end" && "justify-end text-end",
              )}
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
              {header}
            </button>
          ) : (
            <div
              key={column.id}
              role="columnheader"
              className={cn(
                "flex h-10 items-center px-3.5 font-mono text-2xs tracking-[0.12em] whitespace-nowrap text-muted-foreground uppercase",
                column.align === "end" && "justify-end text-end",
              )}
            >
              {column.header}
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
              selected
                ? "bg-primary/[0.07] shadow-[inset_2px_0_0_var(--color-primary)]"
                : "hover:bg-muted/60",
            ),
            style: { gridTemplateColumns: template } as CSSProperties,
            "data-desktop-row": "" as const,
          };
          const cells = columns.map((column) => (
            <span
              key={column.id}
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
  );
}
