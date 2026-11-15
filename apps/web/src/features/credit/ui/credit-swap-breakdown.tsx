import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";

/**
 * One swap of a routed exchange, "Swap 1: AAA → BBB · Kilifi Pool", with its
 * amounts or fees as compact lines beneath. The review's route details and
 * the receipt's Details list one per swap, in order.
 */
export function CreditSwapBreakdown({
  position,
  path,
  poolName,
  lines,
}: {
  /** The swap's place in the route, already in the locale's digits. */
  position: string;
  /** "AAA → BBB". */
  path: string;
  poolName: string;
  lines: { key: string; label: ReactNode; value: ReactNode }[];
}) {
  return (
    <div className="space-y-1 border-b border-border px-3 py-2.5">
      <p className="text-xs font-semibold">
        <Trans>
          Swap {position}: <span dir="ltr">{path}</span> · {poolName}
        </Trans>
      </p>
      {lines.map((line) => (
        <div key={line.key} className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">{line.label}</span>
          <span dir="ltr" className="min-w-0 break-words text-end font-mono font-semibold">
            {line.value}
          </span>
        </div>
      ))}
    </div>
  );
}
