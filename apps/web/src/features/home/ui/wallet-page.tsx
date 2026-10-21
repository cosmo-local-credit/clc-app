import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  RiArrowRightSLine,
  RiBankCardLine,
  RiDownloadLine,
  RiSendPlane2Line,
} from "react-icons/ri";

import { ScreenBar } from "#/components/market-bar";
import { ScreenSearchField } from "#/components/market-search";
import { Button } from "#/components/ui/button";
import { PoolLogo, SectionHeader, TokenLogo, type WalletToken } from "#/components/wallet";
import { ResourceLimitMessage } from "#/components/resource-usage";
import { useOwnedPoolsInfinite } from "#/features/pools/hooks/use-user-pools";
import { useLatestAccountTokens } from "#/features/wallet/hooks/use-account-balances";
import { usePartitionedVouchers } from "#/features/wallet/hooks/use-partitioned-vouchers";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";
import { useResourceUsage } from "#/hooks/use-resource-usage";
import { CompleteProfileBanner } from "./complete-profile-banner";
import { MyCatalogSection } from "#/components/catalogs/my-catalog-section";
import { useMyCatalog } from "#/features/catalogs/hooks/use-my-catalog";
import { RESOURCE_HUE, RESOURCE_ICON, RESOURCE_OUTLINE } from "#/components/resource-tone";
import { parseVoucherAddress } from "#/lib/navigation/voucher-sheet-search";
import { cn } from "#/lib/utils";
import { ListSkeleton } from "#/components/ui/list-skeleton";

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
  const balancesQuery = useLatestAccountTokens(address);
  const voucherGroups = usePartitionedVouchers(
    balancesQuery.data?.tokens.map(accountTokenToWalletToken) ?? [],
    address,
  );
  const usage = useResourceUsage();
  // Only the first page: this is a shortcut into pools a steward manages, not a
  // list to page through. "All pools" carries the rest.
  //
  // Re-checked against the owner here as well. `owner` is a server predicate,
  // but a backend that predates it ignores unknown query parameters and answers
  // with the whole catalog — which would present every pool on the network as
  // this user's. A row the server did filter already passes, so this costs
  // nothing once clc-core has the parameter.
  const ownedPoolsQuery = useOwnedPoolsInfinite(address);
  const ownedPools = (ownedPoolsQuery.data?.pages[0]?.pools ?? []).filter(
    (pool) => pool.ownerAddress?.toLowerCase() === address?.toLowerCase(),
  );
  const catalogQuery = useMyCatalog();
  // The bar's search narrows the Wallet in place, by name or symbol. While it
  // is on, only the matching lists show: nothing to send, create or complete.
  const [search, setSearch] = useState("");
  const term = search.trim().toLocaleLowerCase();
  const searching = term !== "";
  const named = (...texts: readonly (string | null | undefined)[]) =>
    !searching || texts.some((text) => text?.toLocaleLowerCase().includes(term));
  const holdings = voucherGroups.holdings.filter((token) => named(token.symbol, token.name));
  const issued = voucherGroups.issued.filter((token) => named(token.symbol, token.name));
  const pools = ownedPools.filter((pool) => named(pool.name));
  const vouchersSettled =
    !voucherGroups.isPending && !balancesQuery.isPending && !voucherGroups.isError;
  const nothingMatches =
    searching &&
    vouchersSettled &&
    holdings.length === 0 &&
    issued.length === 0 &&
    ownedPoolsQuery.isSuccess &&
    pools.length === 0 &&
    catalogQuery.isSuccess &&
    !catalogQuery.catalogs.some((catalog) => named(catalog.name));

  return (
    <div>
      <h1 className="sr-only">
        <Trans>Wallet</Trans>
      </h1>
      <ScreenBar current="wallet">
        <ScreenSearchField value={search} onChange={setSearch} label={t`Search your wallet`} />
      </ScreenBar>
      <div className="mt-3 space-y-6">
        {searching ? null : <CompleteProfileBanner address={address} />}

        {nothingMatches ? (
          <p
            role="status"
            className="border border-border bg-card p-4 text-sm text-muted-foreground"
          >
            <Trans>Nothing in your wallet matches this search.</Trans>
          </p>
        ) : null}

        {searching ? null : (
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
        )}

        {usage.isError && !searching ? (
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

        {voucherGroups.isPending || balancesQuery.isPending ? (
          <section aria-labelledby="my-vouchers-title">
            <SectionHeader
              id="my-vouchers-title"
              title={<Trans>My Vouchers</Trans>}
              action={<Trans>View all</Trans>}
              onAction={() => {
                void navigate({ to: "/wallet/vouchers" });
              }}
            />
            <div className="border-border bg-card border">
              <ListSkeleton framed={false} count={3} label={<Trans>Loading vouchers…</Trans>} />
            </div>
          </section>
        ) : voucherGroups.isError ? (
          <section aria-labelledby="my-vouchers-title">
            <SectionHeader
              id="my-vouchers-title"
              title={<Trans>My Vouchers</Trans>}
              action={<Trans>View all</Trans>}
              onAction={() => void navigate({ to: "/wallet/vouchers" })}
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
                  onClick={() => void voucherGroups.refetch()}
                >
                  <Trans>Try again</Trans>
                </Button>
              </div>
            </div>
          </section>
        ) : (
          <>
            {balancesQuery.isError ? (
              <div role="alert" className="border-border bg-card space-y-2 border p-3">
                <p className="text-muted-foreground text-sm">
                  <Trans>Couldn't load vouchers.</Trans>
                </p>
                <Button
                  variant="outline"
                  tap
                  pending={balancesQuery.isFetching}
                  onClick={() => void balancesQuery.refetch()}
                >
                  <Trans>Try again</Trans>
                </Button>
              </div>
            ) : null}
            {holdings.length > 0 ? (
              <section aria-labelledby="holdings-title">
                <SectionHeader id="holdings-title" title={<Trans>Holdings</Trans>} />
                <div className="border-border bg-card border">
                  <WalletVoucherRows tokens={holdings} />
                </div>
              </section>
            ) : null}
            {searching && issued.length === 0 ? null : (
              <section aria-labelledby="my-vouchers-title">
                <SectionHeader
                  id="my-vouchers-title"
                  title={<Trans>My Vouchers</Trans>}
                  action={<Trans>View all</Trans>}
                  onAction={() => {
                    void navigate({ to: "/wallet/vouchers" });
                  }}
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
                    <WalletVoucherRows tokens={issued} />
                  )}
                </div>
              </section>
            )}
          </>
        )}

        {searching && ownedPoolsQuery.isSuccess && pools.length === 0 ? null : (
          <section aria-labelledby="my-pools-title">
            <SectionHeader
              id="my-pools-title"
              title={<Trans>My Pools</Trans>}
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
              {pools.map((pool, index, list) => (
                <Link
                  key={pool.address}
                  to="/pools/$poolAddress"
                  params={{ poolAddress: pool.address }}
                  className={[
                    "flex w-full items-center gap-3 p-3 text-start active:bg-muted",
                    index < list.length - 1 ? "border-b border-border" : "",
                  ].join(" ")}
                >
                  <PoolLogo
                    imageUrl={pool.imageUrl}
                    name={pool.name}
                    seed={pool.address}
                    size={34}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{pool.name}</p>
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
            </div>
          </section>
        )}

        <MyCatalogSection usage={usage} search={term} />
      </div>
    </div>
  );
}
