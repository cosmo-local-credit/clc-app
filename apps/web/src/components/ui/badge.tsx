import type * as React from "react";

import { cn } from "#/lib/utils";

type BadgeVariant = "primary" | "muted" | "outline";

export function Badge({
  className,
  variant = "primary",
  ...props
}: React.ComponentProps<"span"> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center border px-3 font-semibold text-[11px]",
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
