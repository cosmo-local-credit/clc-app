import type { ReactNode } from "react";

import { Skeleton } from "#/components/ui/skeleton";

const LINE_WIDTHS = ["w-2/5", "w-1/2", "w-1/3"] as const;

/**
 * A list's first page on its way: placeholders shaped like the rows that will
 * replace them, so the bar and the screen hold still while the content fills
 * in. `rows` are avatar-and-two-lines rows in one panel (pools, vouchers),
 * `cards` are separate picture cards (catalogs), `tiles` the two-column
 * offerings grid. Rows that load inside a panel the screen already draws pass
 * `framed={false}`; posts lead with a square picture rather than an avatar.
 * The label is announced; the shapes are not.
 */
export function ListSkeleton({
  label,
  shape = "rows",
  count = 6,
  framed = true,
  avatar = "round",
  className,
}: {
  label: ReactNode;
  shape?: "rows" | "cards" | "tiles";
  count?: number;
  framed?: boolean;
  avatar?: "round" | "square";
  className?: string;
}) {
  const items = Array.from({ length: count }, (_, index) => index);
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {shape === "rows" ? (
        <div aria-hidden="true" className={framed ? "border border-border bg-card" : undefined}>
          {items.map((index) => (
            <div
              key={index}
              className="flex min-h-16 items-center gap-3 border-b border-border p-3 last:border-b-0"
            >
              <Skeleton
                className={
                  avatar === "square" ? "size-14 shrink-0" : "size-11 shrink-0 rounded-full"
                }
              />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className={`h-3.5 ${LINE_WIDTHS[index % LINE_WIDTHS.length]}`} />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : shape === "cards" ? (
        <div aria-hidden="true" className="space-y-2">
          {items.map((index) => (
            <div
              key={index}
              className="flex min-h-24 items-center gap-3 border border-border bg-card p-3"
            >
              <Skeleton className="size-16 shrink-0" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className={`h-3.5 ${LINE_WIDTHS[index % LINE_WIDTHS.length]}`} />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div aria-hidden="true" className="grid grid-cols-2 gap-2">
          {items.map((index) => (
            <div key={index} className="border border-border bg-card">
              <Skeleton className="h-36 w-full" />
              <div className="min-h-[4.5rem] space-y-2 p-2">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
