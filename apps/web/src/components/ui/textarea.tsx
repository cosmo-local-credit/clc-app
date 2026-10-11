import type * as React from "react";

import { cn } from "#/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      dir="auto"
      data-slot="textarea"
      className={cn(
        "min-h-20 w-full min-w-0 resize-y rounded-none border border-input bg-card px-3 py-2 text-sm outline-none transition-[color,border-color] selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-foreground aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
