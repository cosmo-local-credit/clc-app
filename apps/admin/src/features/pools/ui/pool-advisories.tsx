import { HiOutlineExclamation } from "react-icons/hi";

import { cn } from "#/lib/utils";
import type { PoolAdvisory } from "../pool-posture";

const toneShell: Record<PoolAdvisory["tone"], string> = {
  warning: "border-state-pending/25 bg-state-pending/10 text-state-pending",
  danger: "border-destructive/25 bg-destructive/10 text-destructive",
};

/**
 * What is worth looking at on this pool, and nothing when there is nothing.
 *
 * The panel sits directly under the header because an operator opening a pool is
 * usually chasing one of these, and it renders nothing for a healthy pool: a
 * banner that is always present is a banner nobody reads. Each row is a count
 * and a consequence — the derivation is in `pool-posture`, and the reasoning
 * behind it is in clc-protocol, not on this screen.
 */
export function PoolAdvisories({ advisories }: { advisories: PoolAdvisory[] }) {
  if (advisories.length === 0) return null;

  return (
    <section aria-label="Pool attention" className="border-border bg-card border">
      <ul className="divide-border divide-y">
        {advisories.map((advisory) => (
          <li key={advisory.id} className="flex items-start gap-3 px-4 py-3">
            <span className={cn("shrink-0 border p-1.5", toneShell[advisory.tone])}>
              <HiOutlineExclamation className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium">{advisory.title}</p>
              <p className="text-muted-foreground text-xs leading-relaxed">{advisory.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
