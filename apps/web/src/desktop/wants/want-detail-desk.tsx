import { wantDetailQueryOptions, myWantQueryOptions } from "@clc/api/features/wants/queries";
import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { RiPencilLine } from "react-icons/ri";

import { WantDetail, WantShareButton } from "#/components/wants/want-detail";
import { WantPicture } from "#/components/wants/want-row";
import { Button } from "#/components/ui/button";
import { DeskCanvas, DeskTitleRow } from "#/desktop/ui/page";
import { useDeskTrailLabel } from "#/desktop/trail";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useDiscoveryDistanceOrigin } from "#/features/home/hooks/use-discovery-distance-origin";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { wantsClient } from "#/lib/api/wants";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import { cn } from "#/lib/utils";

/**
 * `.page.detail` over the phone's Want sections: When and where (the map and
 * dates) is the sticky 360px column; tags, Description, Contact and the
 * creator's vouchers and pools run down the main column as plain sections.
 */
const WANT_GRID_CLASS = cn(
  "[&>div]:grid [&>div]:grid-cols-[minmax(0,1fr)_360px] [&>div]:grid-rows-[auto_auto_auto_auto_auto_1fr]",
  "[&>div]:items-start [&>div]:gap-x-6 [&>div]:gap-y-7 [&>div]:space-y-0",
  "[&>div>*]:col-start-1 [&>div>*]:min-w-0",
  // When and where: the side column, a white panel.
  "[&>div>section:first-of-type]:col-start-2 [&>div>section:first-of-type]:row-[1/-1]",
  "[&>div>section:first-of-type]:sticky [&>div>section:first-of-type]:top-7 [&>div>section:first-of-type]:self-start",
  // The rest: section heading over content, no card around it.
  "[&>div>section:not(:first-of-type)]:border-0 [&>div>section:not(:first-of-type)]:bg-transparent [&>div>section:not(:first-of-type)]:p-0",
  "[&>div>section>h2]:font-heading [&>div>section>h2]:text-base [&>div>section>h2]:font-semibold",
  "[&>div>section>div.border]:bg-card",
);

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

  if (query.isPending) {
    return (
      <DeskCanvas width="read">
        <p className="text-sm text-muted-foreground">
          <Trans>Loading Want…</Trans>
        </p>
      </DeskCanvas>
    );
  }
  if (query.isError) {
    return (
      <DeskCanvas width="read">
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
      </DeskCanvas>
    );
  }

  const want = query.data;
  return (
    <DeskCanvas width="read" className="max-w-[1324px]">
      <div className="flex min-w-0 items-center gap-3">
        <WantPicture want={want} size="size-14" />
        <DeskTitleRow
          className="min-w-0 flex-1"
          title={
            <span dir="auto" className="[overflow-wrap:anywhere]">
              {want.name}
            </span>
          }
          actions={
            <>
              {mine.data ? (
                <Button asChild variant="outline">
                  <Link to="/wallet/wants/$wantId/edit" params={{ wantId }}>
                    <RiPencilLine aria-hidden="true" />
                    <Trans>Edit Want</Trans>
                  </Link>
                </Button>
              ) : null}
              <span className="[&>button]:border-foreground/25 [&>button]:bg-card">
                <WantShareButton want={want} />
              </span>
            </>
          }
        />
      </div>
      <div className={WANT_GRID_CLASS}>
        <WantDetail
          want={want}
          showHeader={false}
          distanceOrigin={distanceOrigin}
          showLocationMap
          showRelated
        />
      </div>
    </DeskCanvas>
  );
}
