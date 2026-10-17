import type * as React from "react";

import { cn } from "#/lib/utils";

type BadgeVariant = "primary" | "muted" | "outline";

/**
 * Every small chip: 11px semibold. `sm` is the 20px chip that sits inside a
 * row or beside a value. `caps` sets a status in capitals, the one place the
 * type scale allows positive tracking.
 */
export function Badge({
  className,
  variant = "primary",
  size = "default",
  caps = false,
  ...props
}: React.ComponentProps<"span"> & {
  variant?: BadgeVariant;
  size?: "default" | "sm";
  caps?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center border font-semibold text-2xs",
        size === "sm" ? "h-5 px-1.5" : "h-7 px-3",
        caps && "uppercase tracking-[0.06em]",
        variant === "primary"
          ? "border-primary/35 bg-primary/10 text-primary"
          : variant === "muted"
            ? "border-border bg-muted text-muted-foreground"
            : "border-border bg-card text-foreground",
        className,
      )}
      {...props}
    />
  );
}
