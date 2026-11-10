import type { ReactNode } from "react";

const ROW_GRID =
  "grid min-h-14 grid-cols-[220px_minmax(0,1fr)_auto] items-center gap-4 ps-4 pe-2.5";

/** One Settings group's rows in a white tile, split by rules. */
export function SetRows({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col border border-border bg-card [&>*+*]:border-border [&>*+*]:border-t">
      {children}
    </div>
  );
}

/** Every Settings row is one shape — label, value, action — so they line up across groups. */
export function SetRow({
  id,
  label,
  value,
  action,
}: {
  /** An anchor other pages link to, as the top bar's notification settings do. */
  id?: string;
  label: ReactNode;
  value?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div id={id} className={ROW_GRID}>
      <span className="min-w-0 truncate text-sm font-semibold">{label}</span>
      <div className="flex min-w-0 items-center gap-2 text-xs">{value}</div>
      <div className="flex shrink-0 items-center justify-end">{action}</div>
    </div>
  );
}
