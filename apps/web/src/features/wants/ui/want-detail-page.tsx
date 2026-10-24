import { wantDetailQueryOptions } from "@clc/api/features/wants/queries";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Button } from "#/components/ui/button";
import { BackChevron } from "#/components/wallet";
import { wantsClient } from "#/lib/api/wants";
import { WantDetail } from "#/components/wants/want-detail";
import { useDiscoveryDistanceOrigin } from "#/features/home/hooks/use-discovery-distance-origin";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";

export function WantDetailPage({
  id,
  from,
  poolAddress,
}: {
  id: string;
  from?: "market" | "wallet";
  poolAddress?: string;
}) {
  const { t } = useLingui();
  const query = useQuery({ ...wantDetailQueryOptions(wantsClient, id), retry: false });
  const distanceOrigin = useDiscoveryDistanceOrigin(useStorageOwner() ?? GUEST_STORAGE_OWNER);
  const fallback = poolAddress
    ? { label: t`Pool`, to: `/pools/${poolAddress}`, search: { tab: "wants" } }
    : from === "wallet"
      ? { label: t`Wallet`, to: "/", search: { tab: "wallet" } }
      : { label: t`Wants`, to: "/market", search: { scope: "wants" } };
  return (
    <main className="min-h-[100svh] space-y-4 bg-background px-4 pb-bottom-nav pt-[calc(env(safe-area-inset-top)+0.875rem)]">
      <BackChevron label={fallback.label} to={fallback.to} search={fallback.search} />
      {query.isPending ? (
        <p className="border border-border bg-card p-4 text-sm">
          <Trans>Loading Want…</Trans>
        </p>
      ) : query.isError ? (
        <div className="space-y-3 border border-border bg-card p-4" role="alert">
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
        <WantDetail want={query.data} distanceOrigin={distanceOrigin} />
      )}
    </main>
  );
}
