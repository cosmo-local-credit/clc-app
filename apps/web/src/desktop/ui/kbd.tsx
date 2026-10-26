import type { ReactNode } from "react";

import { cn } from "#/lib/utils";

export function DeskKbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 items-center border border-border bg-muted px-1.5 font-mono text-2xs text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
