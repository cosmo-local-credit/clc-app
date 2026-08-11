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
        "flex flex-col items-center justify-center gap-3 border border-dashed border-border bg-muted/15 px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="border border-border bg-muted/50 p-2.5 text-muted-foreground">{icon}</div>
      ) : null}
      <div className="space-y-1">
        <p className="font-mono text-xs font-semibold tracking-wide uppercase">{title}</p>
        {description ? (
          <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
