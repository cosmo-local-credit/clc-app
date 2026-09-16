import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border bg-muted/15 flex flex-col items-center justify-center gap-3 border border-dashed px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="border-border bg-muted/50 text-muted-foreground border p-2.5">{icon}</div>
      ) : null}
      {/* The title is a mono micro-label, tracked to match section headings and
          metric labels — the console's third letter-spacing for the same role was
          this one. The description is body copy and takes the body size. */}
      <div className="space-y-1">
        <p className="font-mono text-xs font-semibold tracking-[0.14em] uppercase">{title}</p>
        {description ? (
          <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
