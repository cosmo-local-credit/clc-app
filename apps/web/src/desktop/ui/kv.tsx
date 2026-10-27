import type { ReactNode } from "react";

import { cn } from "#/lib/utils";

/**
 * Label and value pairs in one bordered grid: the review summary beside Send
 * and Swap, transfer details, voucher facts. Values are mono.
 */
export function DeskKV({
  rows,
  className,
  labelWidth = "110px",
}: {
  rows: readonly (readonly [ReactNode, ReactNode] | null | false | undefined)[];
  className?: string;
  labelWidth?: string;
}) {
  const shown = rows.filter((row): row is readonly [ReactNode, ReactNode] => Boolean(row));
  return (
    <dl
      className={cn("grid border border-border bg-card text-sm", className)}
      style={{ gridTemplateColumns: `${labelWidth} minmax(0,1fr)` }}
    >
      {shown.map(([label, value], index) => {
        const last = index === shown.length - 1;
        return (
          <div key={index} className="contents">
            <dt
              className={cn(
                "bg-muted px-3 py-2 text-muted-foreground",
                !last && "border-border border-b",
              )}
            >
              {label}
            </dt>
            <dd
              className={cn(
                "m-0 min-w-0 truncate px-3 py-2 font-mono font-semibold",
                !last && "border-border border-b",
              )}
            >
              {value}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** A strip of figures under a page title: VOUCHERS 6 · LIQUIDITY 48,200.00. */
export function DeskStats({
  items,
  className,
}: {
  items: readonly { label: ReactNode; value: ReactNode; detail?: ReactNode }[];
  className?: string;
}) {
  return (
    <div
      className={cn("grid border border-border bg-card", className)}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))` }}
    >
      {items.map((item, index) => (
        <div
          key={index}
          className={cn("min-w-0 px-4 py-3.5", index > 0 && "border-border border-s")}
        >
          <div className="font-mono text-2xs tracking-[0.12em] text-muted-foreground uppercase">
            {item.label}
          </div>
          <div className="mt-1 truncate font-mono text-lg font-semibold">{item.value}</div>
          {item.detail ? (
            <div className="truncate text-xs text-muted-foreground">{item.detail}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
