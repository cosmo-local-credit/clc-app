import { BackendApiError, formatBackendApiError } from "@clc/api/client/errors";
import { Plural, Trans, useLingui } from "@lingui/react/macro";

import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";

import { useMoveOldCardAssets } from "../hooks/use-key-rotation";
import { useRotationSession } from "../state/rotation-session";
import { RotationAssetList } from "./rotation-asset-list";

/**
 * Moves what the old wallet holds, signed by the old card or its passkey.
 * Safe to run again: each run plans from chain state, so whatever already
 * moved is not planned twice.
 */
export function MoveStep({ onFinished }: { onFinished: () => void }) {
  const { t } = useLingui();
  const progress = useRotationSession((state) => state.moveProgress);
  const outcome = useRotationSession((state) => state.moveOutcome);
  const move = useMoveOldCardAssets();
  const running = move.isPending || progress !== null;

  const error = move.error
    ? move.error instanceof BackendApiError
      ? formatBackendApiError(move.error)
      : move.error.message
    : null;
  const groups = outcome?.batches.flatMap((batch, index) =>
    outcome.moved.includes(index) ? batch.groups : [],
  );
  const finished = outcome !== null && outcome.uncertainTrackingId === null;
  const failedCount = outcome?.failed.length ?? 0;

  return (
    <div className="space-y-6">
      {running ? (
        <div className="flex items-center gap-2.5 border border-border bg-card p-3 text-sm">
          <Spinner className="size-4" />
          <p>
            {progress ? (
              <Trans>
                Moving {progress.current + 1} of {progress.total}
              </Trans>
            ) : (
              <Trans>Checking what the old card holds…</Trans>
            )}
          </p>
        </div>
      ) : null}

      {outcome ? (
        <section className="space-y-2">
          <RotationAssetList groups={groups ?? []} skipped={outcome.skipped} />
          {failedCount > 0 ? (
            <p role="alert" className="text-destructive text-xs">
              <Plural
                value={failedCount}
                one="# transaction failed. Try again to move what is left."
                other="# transactions failed. Try again to move what is left."
              />
            </p>
          ) : null}
          {outcome.uncertainTrackingId ? (
            <p role="alert" className="text-destructive text-xs">
              <Trans>The last move is still settling. Check again in a minute.</Trans>
            </p>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}

      {finished && failedCount === 0 ? (
        <Button tap className="w-full" onClick={onFinished}>
          <Trans>Continue</Trans>
        </Button>
      ) : (
        <Button tap className="w-full" pending={running} onClick={() => move.mutate()}>
          {running ? t`Moving…` : outcome ? t`Try again` : t`Move to my new card`}
        </Button>
      )}
    </div>
  );
}
