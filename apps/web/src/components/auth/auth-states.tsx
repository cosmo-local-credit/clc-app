import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button";
import { SectionHeading } from "#/components/ui/section-heading";

export function ApprovalPending({ onRetry, busy }: { onRetry?: () => void; busy?: boolean }) {
  return (
    <div className="border border-border bg-card p-4">
      <SectionHeading>
        <Trans>Account awaiting approval</Trans>
      </SectionHeading>
      <p className="mt-1 text-muted-foreground text-sm">
        <Trans>
          Your account is awaiting approval. You will be able to continue once it is approved.
        </Trans>
      </p>
      {onRetry ? (
        <Button tap className="mt-3 w-full" onClick={onRetry} pending={busy}>
          <Trans>Check again</Trans>
        </Button>
      ) : null}
    </div>
  );
}

export function ApprovalRejected({ children }: { children?: ReactNode }) {
  return (
    <div className="border border-border bg-card p-4">
      <SectionHeading>
        <Trans>Account not approved</Trans>
      </SectionHeading>
      <p className="mt-1 text-muted-foreground text-sm">
        <Trans>
          This account cannot be approved. Contact support if you think this is a mistake.
        </Trans>
      </p>
      {children}
    </div>
  );
}
