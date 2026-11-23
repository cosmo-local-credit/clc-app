import { Trans } from "@lingui/react/macro";
import { Button } from "#/components/ui/button";
import { ListSkeleton } from "#/components/ui/list-skeleton";
import { WantRow } from "#/components/wants/want-row";
import { useVoucherWants } from "#/features/wants/hooks/use-voucher-wants";

export function VoucherWantsPanel({ address }: { address: string }) {
  const { query, wants } = useVoucherWants(address);
  return (
    <div className="space-y-3">
      {query.isPending ? <ListSkeleton label={<Trans>Loading Wants…</Trans>} /> : null}
      {query.isError ? (
        <div role="alert" className="space-y-3 border border-border bg-card p-4">
          <p className="text-sm">
            <Trans>Couldn't load Wants.</Trans>
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
      ) : null}
      {wants.length ? (
        <div className="border border-border bg-card">
          {wants.map((want) => (
            <WantRow key={want.id} want={want} />
          ))}
        </div>
      ) : !query.isPending && !query.isError ? (
        <p className="border border-border bg-card p-4 text-sm text-muted-foreground">
          <Trans>No Wants yet.</Trans>
        </p>
      ) : null}
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
