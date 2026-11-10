import type { ReactNode } from "react";

import { cn } from "#/lib/utils";

/**
 * Label and value pairs in one bordered grid: the review summary beside Send
 * and Swap, transfer details, voucher facts. Values are mono. They wrap, so a
 * person verifying a name, address or amount sees all of it; pass `truncate`
 * only for a compact browsing summary whose full value lives elsewhere.
 */
export function DeskKV({
  rows,
  className,
  labelWidth = "110px",
  truncate = false,
}: {
  rows: readonly (readonly [ReactNode, ReactNode] | null | false | undefined)[];
  className?: string;
  labelWidth?: string;
  truncate?: boolean;
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
                "m-0 min-w-0 px-3 py-2 font-mono font-semibold",
                truncate ? "truncate" : "[overflow-wrap:anywhere]",
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
