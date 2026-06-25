import type { ReactNode } from "react";
import { RiCheckLine, RiFingerprintLine } from "react-icons/ri";

import { Trans } from "@lingui/react/macro";
import { cn } from "#/lib/utils";

export function NetworkBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border border-border bg-card px-2 py-0.5 font-semibold text-xs",
        className,
      )}
    >
      <span className="size-2 rounded-full bg-primary" />
      <Trans>Celo network</Trans>
    </span>
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
