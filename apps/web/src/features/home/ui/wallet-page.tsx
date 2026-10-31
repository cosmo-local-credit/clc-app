import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  RiArrowRightSLine,
  RiBankCardLine,
  RiDownloadLine,
  RiSendPlane2Line,
  RiPencilLine,
} from "react-icons/ri";
import { myWantsInfiniteQueryOptions } from "@clc/api/features/wants/queries";
import { useInfiniteQuery } from "@tanstack/react-query";

import { Button } from "#/components/ui/button";
import { PoolLogo, SectionHeader, TokenLogo, type WalletToken } from "#/components/wallet";
import { ResourceLimitMessage, ResourceQuotaTitle } from "#/components/resource-usage";
import { useOwnedPoolsInfinite } from "#/features/pools/hooks/use-user-pools";
import { useSafeOwnersSignedBy } from "#/features/ownership/hooks/use-asset-owner-info";
import { useWalletVoucherPreview } from "#/features/wallet/hooks/use-wallet-voucher-preview";
import { useResourceUsage } from "#/hooks/use-resource-usage";
import { CompleteProfileBanner } from "./complete-profile-banner";
import { MyCatalogSection } from "#/components/catalogs/my-catalog-section";
import { RESOURCE_HUE, RESOURCE_ICON, RESOURCE_OUTLINE } from "#/components/resource-tone";
import { parseVoucherAddress } from "#/lib/navigation/voucher-sheet-search";
import { cn } from "#/lib/utils";
import { ListSkeleton } from "#/components/ui/list-skeleton";
import { wantsClient } from "#/lib/api/wants";
import { WantPicture } from "#/components/wants/want-row";

function WalletVoucherRows({ tokens }: { tokens: readonly WalletToken[] }) {
  return tokens.map((token, index, list) => {
    const address = parseVoucherAddress(token.contractAddress ?? token.id);
    const className = [
      "flex w-full items-center gap-3 p-3 text-start",
      index < list.length - 1 ? "border-b border-border" : "",
    ].join(" ");
    const content = (
      <>
        <TokenLogo token={token} size={34} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{token.symbol}</p>
          <p className="text-muted-foreground truncate text-xs">{token.name}</p>
        </div>
        <div className="shrink-0 text-end">
          <p className="font-heading text-sm font-semibold tracking-tight">{token.amount}</p>
        </div>
      </>
    );
    return address ? (
      <Link
        key={token.id}
        to="/vouchers/$voucherAddress"
        params={{ voucherAddress: address }}
        search={{ from: "wallet" }}
        className={className}
      >
        {content}
      </Link>
    ) : (
      <div key={token.id} className={className}>
        {content}
      </div>
    );
  });
}

export function WalletPage({ address }: { address?: string }) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const actions = [
    { id: "send", label: t`Send`, icon: RiSendPlane2Line, variant: "default", to: "/wallet/send" },
    {
      id: "receive",
      label: t`Receive`,
      icon: RiDownloadLine,
      variant: "outline",
      to: "/wallet/receive",
    },
    {
      id: "cash",
      label: t`Cash`,
      icon: RiBankCardLine,
      variant: "outline",
      to: "/wallet/cash",
    },
  ] as const;
  const voucherGroups = useWalletVoucherPreview(address);
  const usage = useResourceUsage();
  const wantsQuery = useInfiniteQuery(myWantsInfiniteQueryOptions(wantsClient, address ?? ""));
  const wants = wantsQuery.data?.pages.flatMap((page) => page.wants) ?? [];
  // The protected list keeps retired pools reachable for withdrawals. It is
  // paginated here because public "All pools" intentionally hides them. Rows are
  // still re-checked: this account's pools, or those of a Safe it signs for,
  // which clc-core lists too. Anything else is a response that ignored the
  // session's scope and is not "your pools".
  const ownedPoolsQuery = useOwnedPoolsInfinite(address);
  const ownedPoolRows = ownedPoolsQuery.data?.pages.flatMap((page) => page.pools) ?? [];
  const account = address?.toLowerCase();
  const signedSafes = useSafeOwnersSignedBy(
    ownedPoolRows.flatMap((pool) =>
      pool.ownerAddress && pool.ownerAddress.toLowerCase() !== account ? [pool.ownerAddress] : [],
    ),
    address,
  );
  const ownedPools = ownedPoolRows.filter((pool) => {
    const owner = pool.ownerAddress?.toLowerCase();
    return !!owner && (owner === account || signedSafes.has(owner));
  });
  const myVouchersTitle = (
    <ResourceQuotaTitle
      quota={usage.data?.vouchers}
      pending={usage.isPending}
      error={usage.isError}
    >
      <Trans>My Vouchers</Trans>
    </ResourceQuotaTitle>
  );
  const openAllVouchers = () => void navigate({ to: "/wallet/vouchers" });
  const viewAllAction = <Trans>View all</Trans>;

  return (
    <div className="space-y-6">
      <h1>
        <Trans>Wallet</Trans>
      </h1>

      <CompleteProfileBanner address={address} />

      <section aria-label={t`Wallet actions`} className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Button key={action.id} asChild variant={action.variant} size="tile">
                <Link to={action.to}>
                  <Icon className="size-4" aria-hidden="true" />
                  {action.label}
                </Link>
              </Button>
            );
          })}
        </div>
      </section>

      {usage.isError ? (
        <div role="alert" className="border-border bg-card space-y-2 border p-3 text-sm">
          <p>
            <Trans>Couldn't load resource limits.</Trans>
          </p>
          <Button
            variant="outline"
            tap
            pending={usage.isFetching}
            onClick={() => void usage.refetch()}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}

      {voucherGroups.isPending ? (
        <section aria-labelledby="my-vouchers-title">
          <SectionHeader
            id="my-vouchers-title"
            title={myVouchersTitle}
            action={viewAllAction}
            actionLabel={`${t`View all`} ${t`My Vouchers`}`}
            onAction={openAllVouchers}
          />
          <div className="border-border bg-card border">
            <ListSkeleton framed={false} count={3} label={<Trans>Loading vouchers…</Trans>} />
          </div>
        </section>
      ) : voucherGroups.isIssuedError ? (
        <section aria-labelledby="my-vouchers-title">
          <SectionHeader
            id="my-vouchers-title"
            title={myVouchersTitle}
            action={viewAllAction}
            actionLabel={`${t`View all`} ${t`My Vouchers`}`}
            onAction={openAllVouchers}
          />
          <div className="border-border bg-card border">
            <div className="space-y-2 p-3">
              <p className="text-muted-foreground text-sm">
                <Trans>Couldn't load vouchers.</Trans>
              </p>
              <Button
                variant="outline"
                tap
                pending={voucherGroups.isFetching}
                onClick={() => void voucherGroups.refetchIssued()}
              >
                <Trans>Try again</Trans>
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <>
          {voucherGroups.isBalanceError ? (
            <div role="alert" className="border-border bg-card space-y-2 border p-3">
              <p className="text-muted-foreground text-sm">
                <Trans>Couldn't load vouchers.</Trans>
              </p>
              <Button
                variant="outline"
                tap
                pending={voucherGroups.isFetching}
                onClick={() => void voucherGroups.refetchBalances()}
              >
                <Trans>Try again</Trans>
              </Button>
            </div>
          ) : null}
          {voucherGroups.holdings.length > 0 ? (
            <section aria-labelledby="holdings-title">
              <SectionHeader
                id="holdings-title"
                title={<Trans>Holdings</Trans>}
                action={viewAllAction}
                actionLabel={`${t`View all`} ${t`Holdings`}`}
                onAction={openAllVouchers}
              />
              <div className="border-border bg-card border">
                <WalletVoucherRows tokens={voucherGroups.holdings} />
              </div>
            </section>
          ) : null}
          <section aria-labelledby="my-vouchers-title">
            <SectionHeader
              id="my-vouchers-title"
              title={myVouchersTitle}
              action={viewAllAction}
              actionLabel={`${t`View all`} ${t`My Vouchers`}`}
              onAction={openAllVouchers}
            />
            <div className="border-border bg-card border">
              {voucherGroups.issued.length === 0 ? (
                <div className="space-y-3 p-3">
                  <p className="text-muted-foreground text-sm">
                    <Trans>No vouchers yet.</Trans>
                  </p>
                  <ResourceLimitMessage quota={usage.data?.vouchers} />
                  <Button
                    asChild={usage.data?.vouchers.canCreate === true && !usage.isError}
                    disabled={usage.data?.vouchers.canCreate !== true || usage.isError}
                    variant="outline"
                    tap
                    className={cn("w-full", RESOURCE_HUE.vouchers, RESOURCE_OUTLINE)}
                  >
                    {usage.data?.vouchers.canCreate === true && !usage.isError ? (
                      <Link to="/vouchers/create/$step" params={{ step: "voucher" }}>
                        <RESOURCE_ICON.vouchers aria-hidden="true" />
                        <Trans>Create voucher</Trans>
                      </Link>
                    ) : (
                      <span>
                        <RESOURCE_ICON.vouchers aria-hidden="true" />
                        <Trans>Create voucher</Trans>
                      </span>
                    )}
                  </Button>
                </div>
              ) : (
                <WalletVoucherRows tokens={voucherGroups.issued} />
              )}
            </div>
          </section>
        </>
      )}

      <section aria-labelledby="my-wants-title">
        <SectionHeader
          id="my-wants-title"
          title={
            <ResourceQuotaTitle
              quota={usage.data?.wants}
              pending={usage.isPending}
              error={usage.isError}
            >
              <Trans>My Wants</Trans>
            </ResourceQuotaTitle>
          }
          action={usage.data?.wants?.canCreate ? <Trans>Create</Trans> : undefined}
          actionTo={usage.data?.wants?.canCreate ? "/wallet/wants/new" : undefined}
        />
        <ResourceLimitMessage quota={usage.data?.wants} />
        <div className="border-border bg-card border">
          {wantsQuery.isPending ? (
            <ListSkeleton framed={false} count={2} label={<Trans>Loading Wants…</Trans>} />
          ) : wantsQuery.isError ? (
            <div className="space-y-2 p-3">
              <p className="text-muted-foreground text-sm">
                <Trans>Couldn't load your Wants.</Trans>
              </p>
              <Button
                variant="outline"
                tap
                pending={wantsQuery.isFetching}
                onClick={() => void wantsQuery.refetch()}
              >
                <Trans>Try again</Trans>
              </Button>
            </div>
          ) : wants.length === 0 ? (
            <div className="space-y-3 p-3">
              <p className="text-muted-foreground text-sm">
                <Trans>No Wants yet.</Trans>
              </p>
              <Button
                asChild={usage.data?.wants.canCreate === true && !usage.isError}
                disabled={usage.data?.wants.canCreate !== true || usage.isError}
                variant="outline"
                tap
                className={cn("w-full", RESOURCE_HUE.wants, RESOURCE_OUTLINE)}
              >
                {usage.data?.wants.canCreate === true && !usage.isError ? (
                  <Link to="/wallet/wants/new">
                    <RESOURCE_ICON.wants aria-hidden="true" />
                    <Trans>Create Want</Trans>
                  </Link>
                ) : (
                  <span>
                    <RESOURCE_ICON.wants aria-hidden="true" />
                    <Trans>Create Want</Trans>
                  </span>
                )}
              </Button>
            </div>
          ) : (
            <>
              {wants.map((want, index) => (
                <Link
                  key={want.id}
                  to="/wallet/wants/$wantId/edit"
                  params={{ wantId: want.id }}
                  className={cn(
                    "flex min-h-16 items-center gap-3 p-3",
                    index < wants.length - 1 && "border-b border-border",
                  )}
                >
                  <WantPicture want={want} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{want.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {want.state === "scheduled" ? (
                        <Trans>Scheduled</Trans>
                      ) : want.state === "expired" ? (
                        <Trans>Expired</Trans>
                      ) : want.state === "closed" ? (
                        <Trans>Closed</Trans>
                      ) : (
                        <Trans>Active</Trans>
                      )}
                    </span>
                  </span>
                  <RiPencilLine className="size-4 text-muted-foreground" aria-hidden="true" />
                </Link>
              ))}
              {wantsQuery.hasNextPage ? (
                <Button
                  variant="outline"
                  tap
                  className="m-3 w-[calc(100%-1.5rem)]"
                  pending={wantsQuery.isFetchingNextPage}
                  onClick={() => void wantsQuery.fetchNextPage()}
                >
                  <Trans>Load more</Trans>
                </Button>
              ) : null}
            </>
          )}
        </div>
      </section>

      <section aria-labelledby="my-pools-title">
        <SectionHeader
          id="my-pools-title"
          title={
            <ResourceQuotaTitle
              quota={usage.data?.pools}
              pending={usage.isPending}
              error={usage.isError}
            >
              <Trans>My Pools</Trans>
            </ResourceQuotaTitle>
          }
          action={<Trans>All pools</Trans>}
          actionTo="/pools"
        />
        <div className="border-border bg-card border">
          {ownedPoolsQuery.isPending ? (
            <ListSkeleton framed={false} count={2} label={<Trans>Loading pools…</Trans>} />
          ) : null}
          {ownedPoolsQuery.isError ? (
            <div className="space-y-2 p-3">
              <p className="text-muted-foreground text-sm">
                <Trans>Couldn't load your pools.</Trans>
              </p>
              <Button
                variant="outline"
                tap
                pending={ownedPoolsQuery.isFetching}
                onClick={() => void ownedPoolsQuery.refetch()}
              >
                <Trans>Try again</Trans>
              </Button>
            </div>
          ) : null}
          {ownedPoolsQuery.isSuccess && ownedPools.length === 0 ? (
            <div className="space-y-3 p-3">
              <p className="text-muted-foreground text-sm">
                <Trans>You haven't created a pool yet.</Trans>
              </p>
              <ResourceLimitMessage quota={usage.data?.pools} />
              <Button
                asChild={usage.data?.pools.canCreate === true && !usage.isError}
                disabled={usage.data?.pools.canCreate !== true || usage.isError}
                variant="outline"
                tap
                className={cn("w-full", RESOURCE_HUE.pools, RESOURCE_OUTLINE)}
              >
                {usage.data?.pools.canCreate === true && !usage.isError ? (
                  <Link to="/pools/create/$step" params={{ step: "pool" }}>
                    <RESOURCE_ICON.pools aria-hidden="true" />
                    <Trans>Create pool</Trans>
                  </Link>
                ) : (
                  <span>
                    <RESOURCE_ICON.pools aria-hidden="true" />
                    <Trans>Create pool</Trans>
                  </span>
                )}
              </Button>
            </div>
          ) : null}
          {ownedPools.map((pool, index, list) => (
            <Link
              key={pool.address}
              to="/pools/$poolAddress"
              params={{ poolAddress: pool.address }}
              className={[
                "flex w-full items-center gap-3 p-3 text-start active:bg-muted",
                index < list.length - 1 ? "border-b border-border" : "",
              ].join(" ")}
            >
              <PoolLogo imageUrl={pool.imageUrl} name={pool.name} seed={pool.address} size={34} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{pool.name}</p>
                {pool.active === false ? (
                  <p className="text-xs font-semibold">
                    <Trans>Retired — withdrawals available</Trans>
                  </p>
                ) : null}
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {pool.voucherCount === 1 ? (
                    <Trans>1 voucher</Trans>
                  ) : (
                    <Trans>{pool.voucherCount} vouchers</Trans>
                  )}
                </p>
              </div>
              <RiArrowRightSLine
                className="rtl:-scale-x-100 text-muted-foreground size-5 shrink-0"
                aria-hidden="true"
              />
            </Link>
          ))}
          {ownedPoolsQuery.hasNextPage ? (
            <div className="p-3">
              <Button
                variant="outline"
                tap
                className="w-full"
                pending={ownedPoolsQuery.isFetchingNextPage}
                onClick={() => void ownedPoolsQuery.fetchNextPage()}
              >
                <Trans>Load more</Trans>
              </Button>
            </div>
          ) : null}
        </div>
      </section>

      <MyCatalogSection usage={usage} />
    </div>
  );
}
