import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button";

export function ApprovalPending({ onRetry, busy }: { onRetry?: () => void; busy?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="font-heading text-base font-semibold">
        <Trans>Account awaiting approval</Trans>
      </h2>
      <p className="mt-1 text-muted-foreground text-sm">
        <Trans>
          Your account is awaiting approval. You will be able to continue once it is approved.
        </Trans>
      </p>
      {onRetry ? (
        <Button className="mt-3 h-11 w-full" onClick={onRetry} disabled={busy}>
          <Trans>Check again</Trans>
        </Button>
      ) : null}
    </div>
  );
}

export function ApprovalRejected({ children }: { children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="font-heading text-base font-semibold">
        <Trans>Account not approved</Trans>
      </h2>
      <p className="mt-1 text-muted-foreground text-sm">
        <Trans>
          This account cannot be approved. Contact support if you think this is a mistake.
        </Trans>
      </p>
      {children}
    </div>
  );
}

export function SessionUnavailable({ children }: { children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="font-heading text-base font-semibold">
        <Trans>Passkey sign-in is not available yet</Trans>
      </h2>
      <p className="mt-1 text-muted-foreground text-sm">
        <Trans>
          Use a paper wallet or private key for now. Passkey sessions will be enabled after the
          backend supports them.
        </Trans>
      </p>
      {children}
    </div>
  );
}
