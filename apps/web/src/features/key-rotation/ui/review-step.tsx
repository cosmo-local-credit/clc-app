import { Trans, useLingui } from "@lingui/react/macro";

import { Button } from "#/components/ui/button";
import { ListSkeleton } from "#/components/ui/list-skeleton";
import { SectionHeading } from "#/components/ui/section-heading";
import { useMySafes } from "#/features/safe/hooks/use-safe-signers";

import { useRotationAssets } from "../hooks/use-key-rotation";
import { useRotationSession } from "../state/rotation-session";
import { RotationAssetList } from "./rotation-asset-list";
import { RotationNotice } from "./rotation-notice";

export function ReviewStep() {
  const { t } = useLingui();
  const oldAddress = useRotationSession((state) => state.oldAddress);
  const newAddress = useRotationSession((state) => state.newAddress);
  const setStep = useRotationSession((state) => state.setStep);
  const assets = useRotationAssets(oldAddress, newAddress);
  const safes = useMySafes();
  const safeCount = safes.data?.length ?? 0;

  return (
    <div className="space-y-6">
      <RotationNotice>
        <Trans>
          Your current card stops working once it is replaced. Anyone who copied it can still spend
          what it holds until it moves, so move everything straight away.
        </Trans>
      </RotationNotice>

      <section className="space-y-2">
        <SectionHeading variant="section">
          <Trans>Moves to your new card</Trans>
        </SectionHeading>
        {assets.isPending ? (
          <ListSkeleton label={t`Checking what this card holds`} count={3} />
        ) : assets.isError ? (
          <div className="space-y-3 border border-border bg-card p-4">
            <p className="text-destructive text-xs">
              <Trans>We couldn't check what this card holds. You can still replace it.</Trans>
            </p>
            <Button
              variant="outline"
              tap
              pending={assets.isFetching}
              onClick={() => void assets.refetch()}
            >
              <Trans>Try again</Trans>
            </Button>
          </div>
        ) : (
          <RotationAssetList groups={assets.data.groups} skipped={assets.data.skipped} />
        )}
      </section>

      {safeCount > 0 ? (
        <RotationNotice>
          <Trans>
            The old card stays a signer on your multisigs. Ask their other signers to replace it.
          </Trans>
        </RotationNotice>
      ) : null}

      <Button tap className="w-full" onClick={() => setStep("card")}>
        <Trans>Continue</Trans>
      </Button>
    </div>
  );
}
