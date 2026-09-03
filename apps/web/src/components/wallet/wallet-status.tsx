import type { CSSProperties, ReactNode } from "react";
import {
  RiArrowLeftDownLine,
  RiArrowRightUpLine,
  RiCheckLine,
  RiCloseLine,
  RiFingerprintLine,
  RiTimeLine,
} from "react-icons/ri";

import { Trans } from "@lingui/react/macro";
import { Badge } from "#/components/ui/badge";
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

export function SignHint({ label, className }: { label?: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 border border-border bg-muted px-2.5 py-2 text-muted-foreground text-xs",
        className,
      )}
    >
      <RiFingerprintLine className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <span>{label ?? <Trans>You'll confirm with Face ID, fingerprint or PIN</Trans>}</span>
    </div>
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
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 text-right font-mono text-xs font-semibold",
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
    "--pending-clock-duration": `${CHAIN_INFO.blockTimeMs}ms`,
  } as CSSProperties;

  return (
    <span
      className={cn(
        "relative flex size-14 items-center justify-center rounded-full border border-warning/40 bg-warning/10 text-warning-foreground",
        className,
      )}
      data-slot="pending-clock"
      style={animationStyle}
    >
      <svg
        viewBox="0 0 64 64"
        className="pointer-events-none absolute -inset-1 size-16 overflow-visible"
        aria-hidden="true"
      >
        <circle
          cx="32"
          cy="32"
          r="30"
          fill="none"
          strokeWidth="1.5"
          className="stroke-warning/15"
        />
        <circle
          cx="32"
          cy="32"
          r="30"
          fill="none"
          pathLength="100"
          strokeDasharray="12 88"
          strokeLinecap="round"
          strokeWidth="1.5"
          className="pending-clock-indicator stroke-warning/60"
          data-slot="pending-clock-indicator"
        />
      </svg>
      <RiTimeLine className="size-7" aria-hidden="true" />
    </span>
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
