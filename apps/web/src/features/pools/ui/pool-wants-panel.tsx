import { poolWantsInfiniteQueryOptions } from "@clc/api/features/wants/queries";
import { Trans } from "@lingui/react/macro";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button } from "#/components/ui/button";
import { ListSkeleton } from "#/components/ui/list-skeleton";
import { WantRow } from "#/components/wants/want-row";
import { wantsClient } from "#/lib/api/wants";

export function PoolWantsPanel({ poolAddress }: { poolAddress: string }) {
  const query = useInfiniteQuery(poolWantsInfiniteQueryOptions(wantsClient, poolAddress));
  const wants = query.data?.pages.flatMap((page) => page.wants) ?? [];
  return (
    <div
      id="pool-panel-wants"
      role="tabpanel"
      aria-labelledby="pool-tab-wants"
      className="space-y-3"
    >
      {query.isPending ? (
        <ListSkeleton label={<Trans>Loading Wants…</Trans>} />
      ) : query.isError && !query.data ? (
        <div className="space-y-3 border border-border bg-card p-4" role="alert">
          <p className="text-sm">
            <Trans>Couldn't load Wants for this pool.</Trans>
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
      ) : wants.length ? (
        <div className="border border-border bg-card">
          {wants.map((want) => (
            <WantRow key={want.id} want={want} poolAddress={poolAddress} />
          ))}
        </div>
      ) : (
        <p className="border border-border bg-card p-4 text-sm text-muted-foreground">
          <Trans>No Wants are connected to this pool yet.</Trans>
        </p>
      )}
      {query.hasNextPage ? (
        <Button
          variant="outline"
          tap
          className="w-full"
          pending={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          <Trans>Load more</Trans>
        </Button>
      ) : null}
    </div>
  );
}
