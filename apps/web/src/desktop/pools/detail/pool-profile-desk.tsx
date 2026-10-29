import type { UserPool } from "@clc/api/features/pools/client";
import { Trans } from "@lingui/react/macro";

import { Button } from "#/components/ui/button";
import type { PoolPrivateInfo } from "#/desktop/pools/detail/pool-info-desk";
import { PoolSidePanel } from "#/desktop/pools/detail/pool-side-panel";
import { usePoolProfileForm } from "#/features/pools/hooks/use-pool-profile-form";
import { PoolProfileFields } from "#/features/pools/ui/pool-profile-fields";

/** Edit the pool's catalog record in the side column. */
export function PoolProfileSide({
  pool,
  privateInfo,
  onClose,
}: {
  pool: UserPool;
  privateInfo?: PoolPrivateInfo;
  onClose: () => void;
}) {
  if (privateInfo?.isPending || privateInfo?.isError) {
    return (
      <PoolSidePanel title={<Trans>Edit pool details</Trans>} onClose={onClose}>
        {privateInfo.isPending ? (
          <p aria-busy="true" className="text-sm text-muted-foreground">
            <Trans>Loading pool information…</Trans>
          </p>
        ) : (
          <div role="alert" className="flex items-center justify-between gap-3 text-sm">
            <p>
              <Trans>Couldn't load pool information.</Trans>
            </p>
            <Button variant="outline" pending={privateInfo.isFetching} onClick={privateInfo.retry}>
              <Trans>Retry</Trans>
            </Button>
          </div>
        )}
      </PoolSidePanel>
    );
  }
  return <PoolProfileForm pool={pool} onClose={onClose} />;
}

/** Mounted once the record is read: TanStack Form takes its defaults once. */
function PoolProfileForm({ pool, onClose }: { pool: UserPool; onClose: () => void }) {
  const profile = usePoolProfileForm({ pool, onClose });
  const { form, update, imageBusy } = profile;
  return (
    <PoolSidePanel
      title={<Trans>Edit pool details</Trans>}
      onClose={onClose}
      onSubmit={() => void form.handleSubmit()}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" disabled={update.isPending} onClick={onClose}>
            <Trans>Cancel</Trans>
          </Button>
          <Button type="submit" pending={update.isPending || imageBusy}>
            {imageBusy ? (
              <Trans>Uploading…</Trans>
            ) : update.isPending ? (
              <Trans>Saving…</Trans>
            ) : (
              <Trans>Save changes</Trans>
            )}
          </Button>
        </div>
      }
    >
      <PoolProfileFields pool={pool} profile={profile} />
    </PoolSidePanel>
  );
}
