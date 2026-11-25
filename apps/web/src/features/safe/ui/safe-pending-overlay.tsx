import { safeAppQueueUrl } from "@clc/core/features/safe/logic";
import { Trans } from "@lingui/react/macro";
import { CatchBoundary } from "@tanstack/react-router";
import { Suspense, type ReactNode } from "react";

import { Button } from "#/components/ui/button";
import {
  DialogBackdrop,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";
import { Spinner } from "#/components/ui/spinner";
import { SAFE_APP_PREFIX } from "#/lib/safe-config";
import { useSafeSheet } from "../state/safe-sheet";

export function SafePendingOverlay({ children }: { children: ReactNode }) {
  const safe = useSafeSheet((state) => state.safe);
  if (!safe) return null;

  return (
    <CatchBoundary getResetKey={() => safe} errorComponent={SafePendingLoadError}>
      <Suspense fallback={<SafePendingLoadStatus />}>{children}</Suspense>
    </CatchBoundary>
  );
}

function SafePendingLoadError() {
  return <SafePendingLoadStatus failed />;
}

function SafePendingLoadStatus({ failed = false }: { failed?: boolean }) {
  const safe = useSafeSheet((state) => state.safe);
  const close = useSafeSheet((state) => state.close);
  return (
    <DialogRoot
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogPortal>
        <DialogBackdrop />
        <DialogContent className="rounded-none shadow-none">
          <DialogTitle>
            <Trans>Multisig transactions</Trans>
          </DialogTitle>
          {failed ? (
            <p role="alert" className="mt-3 text-sm text-muted-foreground">
              <Trans>Couldn't load multisig proposals.</Trans>
            </p>
          ) : (
            <p role="status" className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              <Trans>Loading…</Trans>
            </p>
          )}
          {failed && safe && SAFE_APP_PREFIX ? (
            <div className="mt-4 flex justify-end">
              <Button asChild variant="outline" tap>
                <a
                  href={safeAppQueueUrl(SAFE_APP_PREFIX, safe)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Trans>Open in Safe</Trans>
                </a>
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
}
