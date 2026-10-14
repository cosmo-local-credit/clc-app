import type { CSSProperties, ReactNode } from "react";
import {
  RiArrowLeftDownLine,
  RiArrowRightUpLine,
  RiCheckLine,
  RiCloseLine,
  RiTimeLine,
} from "react-icons/ri";

import { Trans } from "@lingui/react/macro";
import { Badge } from "#/components/ui/badge";
import { Progress, ProgressTrack } from "#/components/ui/progress";
import { cn } from "#/lib/utils";
import { CHAIN_INFO } from "#/lib/chain";

export function NetworkBadge({ className }: { className?: string }) {
  const chainName = CHAIN_INFO.name;

  return (
    <Badge
      variant="muted"
      className={cn("h-auto gap-1.5 bg-card px-2 py-0.5 text-xs normal-case", className)}
    >
      <span className="size-2 rounded-full bg-primary" />
      <Trans>{chainName} network</Trans>
    </Badge>
  );
}

/** Debited or credited amount, signed and coloured so the chain result reads at a glance. */
export function SignedAmount({
  direction,
  amount,
  className,
}: {
  direction: "in" | "out";
  amount: string;
  className?: string;
}) {
  const incoming = direction === "in";
  const Icon = incoming ? RiArrowLeftDownLine : RiArrowRightUpLine;
  return (
    <span
      dir="ltr"
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 text-end font-mono text-xs font-semibold",
        incoming ? "text-primary" : "text-destructive",
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{`${incoming ? "+" : "−"}${amount}`}</span>
    </span>
  );
}

export function SuccessCheck({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary",
        className,
      )}
      style={{ width: 56, height: 56 }}
    >
      <RiCheckLine className="size-7" aria-hidden="true" />
    </span>
  );
}

export function PendingClock({ className }: { className?: string }) {
  const animationStyle = {
    // Pace the countdown to a conservative two-block confirmation window.
    // Gnosis targets five-second blocks, so the ring depletes over 10s. The
    // wait may finish sooner; the ring holds empty if it runs long.
    "--pending-clock-duration": `${CHAIN_INFO.blockTimeMs * 2}ms`,
  } as CSSProperties;

  return (
    <Progress
      value={null}
      aria-hidden="true"
      data-slot="pending-clock"
      className={cn("block size-14 bg-transparent", className)}
      style={animationStyle}
    >
      <ProgressTrack
        className="pending-clock-indicator size-full rounded-full"
        data-slot="pending-clock-indicator"
      />
      {/* The ring is a mask over a conic gradient, so its centre is empty. The
          clock fills it the way the check and cross fill their badges. */}
      <RiTimeLine
        className="absolute inset-0 m-auto size-7 text-warning-foreground"
        data-slot="pending-clock-icon"
        aria-hidden="true"
      />
    </Progress>
  );
}

export function FailureCross({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex size-14 items-center justify-center rounded-full border border-destructive/40 bg-destructive/10 text-destructive",
        className,
      )}
    >
      <RiCloseLine className="size-7" aria-hidden="true" />
    </span>
  );
}

/** Dot + label used by every tracked-transaction receipt to name the on-chain outcome. */
export function StatusPill({
  tone,
  label,
  className,
}: {
  tone: "success" | "pending" | "error";
  label: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold",
        tone === "error"
          ? "text-destructive"
          : tone === "pending"
            ? "text-warning-foreground"
            : "text-primary",
        className,
      )}
    >
      <span
        className={cn(
          "size-2 rounded-full",
          tone === "error" ? "bg-destructive" : tone === "pending" ? "bg-warning" : "bg-primary",
        )}
      />
      {label}
    </span>
  );
}
