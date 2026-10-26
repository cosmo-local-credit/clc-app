import { wantDetailQueryOptions, myWantQueryOptions } from "@clc/api/features/wants/queries";
import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { WantDetail } from "#/components/wants/want-detail";
import { Button } from "#/components/ui/button";
import { DeskCanvas } from "#/desktop/ui/page";
import { DeskInspector, DeskSplit } from "#/desktop/ui/inspector";
import { useDeskTrailLabel } from "#/desktop/trail";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useDiscoveryDistanceOrigin } from "#/features/home/hooks/use-discovery-distance-origin";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { wantsClient } from "#/lib/api/wants";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";

export function WantDetailDesk({ wantId }: { wantId: string }) {
  const query = useQuery({ ...wantDetailQueryOptions(wantsClient, wantId), retry: false });
  const auth = useAuthStatus();
  const mine = useQuery({
    ...myWantQueryOptions(wantsClient, auth.address ?? "", wantId),
    enabled: !!auth.address,
    retry: false,
  });
  const distanceOrigin = useDiscoveryDistanceOrigin(useStorageOwner() ?? GUEST_STORAGE_OWNER);
  useDeskTrailLabel(query.data?.name);

  return (
    <div className="flex h-full min-h-0">
      <DeskSplit
        main={
          <DeskCanvas width="read">
            {query.isPending ? (
              <p className="text-sm">
                <Trans>Loading Want…</Trans>
              </p>
            ) : query.isError ? (
              <div className="space-y-3" role="alert">
                <p className="text-sm">
                  <Trans>Couldn't load this Want.</Trans>
                </p>
                <Button
                  variant="outline"
                  tap
                  pending={query.isFetching}
                  onClick={() => void query.refetch()}
                >
                  <Trans>Retry</Trans>
                </Button>
              </div>
            ) : (
              <WantDetail
                want={query.data}
                distanceOrigin={distanceOrigin}
                showLocationMap
                showRelated
              />
            )}
          </DeskCanvas>
        }
        side={
          mine.data ? (
            <DeskInspector title={<Trans>Want</Trans>}>
              <Button asChild variant="outline">
                <Link to="/wallet/wants/$wantId/edit" params={{ wantId }}>
                  <Trans>Edit Want</Trans>
                </Link>
              </Button>
            </DeskInspector>
          ) : null
        }
      />
    </div>
  );
}
