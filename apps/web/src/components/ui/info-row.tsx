import type { ReactNode } from "react";

/** One label/value row inside a `<dl>` info card. */
export function InfoRow({
  label,
  children,
  muted = false,
}: {
  label: string;
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0">
      <dt className="shrink-0 text-muted-foreground text-xs">{label}</dt>
      <dd
        className={`flex min-w-0 items-center justify-end overflow-hidden break-words text-right text-sm font-medium ${muted ? "text-muted-foreground" : ""}`}
      >
        {children}
      </dd>
    </div>
  );
}
