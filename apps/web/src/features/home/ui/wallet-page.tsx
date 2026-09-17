import { chainHasPretiumRamp } from "@clc/core/features/wallet/pretium";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  RiArrowRightSLine,
  RiBankCardLine,
  RiDownloadLine,
  RiGroupLine,
  RiSendPlane2Line,
} from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { PoolLogo, SectionHeader, TokenLogo } from "#/components/wallet";
import { useOwnedPoolsInfinite } from "#/features/pools/hooks/use-user-pools";
import { useLatestAccountTokens } from "#/features/wallet/hooks/use-account-balances";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";
import { CHAIN_ID, CHAIN_INFO } from "#/lib/chain";

export function WalletPage({ address }: { address?: string }) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const cashAvailable = chainHasPretiumRamp(CHAIN_ID);
  const cashUnavailableReason = t`Cash services aren't available on ${CHAIN_INFO.name}.`;
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
      id: "topup",
      label: t`Cash`,
      icon: RiBankCardLine,
      variant: "outline",
      to: "/wallet/top-up",
    },
    { id: "pools", label: t`Pools`, icon: RiGroupLine, variant: "info", to: "/pools" },
  ] as const;
  const vouchersQuery = useLatestAccountTokens(address);
  const vouchers = vouchersQuery.data?.tokens.map(accountTokenToWalletToken) ?? [];
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

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1>
          <Trans>Wallet</Trans>
        </h1>
        <p className="text-muted-foreground text-sm">
          <Trans>Manage vouchers, pools, and local payments.</Trans>
        </p>
      </div>

      <section aria-label={t`Wallet actions`} className="space-y-3">
        <div className="grid grid-cols-4 gap-2">
          {actions.map((action) => {
            const Icon = action.icon;
            // Pretium's ramps exist only on the chains its worker watches. Keep
            // Cash visible elsewhere so the wallet's four capabilities do not
            // shift around, but use a real disabled button rather than a link to
            // a screen that cannot complete an operation.
            if (action.id === "topup" && !cashAvailable) {
              return (
                <Button
                  key={action.id}
                  disabled
                  variant={action.variant}
                  aria-label={`${action.label}. ${cashUnavailableReason}`}
                  title={cashUnavailableReason}
                  className="h-14 flex-col gap-1 px-1 text-[0.6875rem]"
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {action.label}
                </Button>
              );
            }
            return (
              <Button
                key={action.id}
                asChild
                variant={action.variant}
                className="h-14 flex-col gap-1 px-1 text-[0.6875rem]"
              >
                <Link to={action.to}>
                  <Icon className="size-4" aria-hidden="true" />
                  {action.label}
                </Link>
              </Button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="your-vouchers-title">
        <SectionHeader
          id="your-vouchers-title"
          title={<Trans>Your Vouchers</Trans>}
          action={<Trans>View all</Trans>}
          onAction={() => {
            void navigate({ to: "/wallet/vouchers" });
          }}
        />
        <div className="border border-border bg-card">
          {vouchersQuery.isPending ? (
            <div className="p-3 text-muted-foreground text-sm">
              <Trans>Loading vouchers…</Trans>
            </div>
          ) : null}
          {vouchersQuery.isError ? (
            <div className="space-y-2 p-3">
              <p className="text-muted-foreground text-sm">
                <Trans>Couldn't load vouchers.</Trans>
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-9 bg-card"
                onClick={() => vouchersQuery.refetch()}
              >
                <Trans>Try again</Trans>
              </Button>
            </div>
          ) : null}
          {vouchersQuery.isSuccess && vouchers.length === 0 ? (
            <div className="space-y-3 p-3">
              <p className="text-muted-foreground text-sm">
                <Trans>No vouchers yet.</Trans>
              </p>
              <Button asChild variant="outline" className="h-9 w-full bg-card">
                <Link to="/vouchers/create/$step" params={{ step: "voucher" }}>
                  <Trans>Create voucher</Trans>
                </Link>
              </Button>
            </div>
          ) : null}
          {vouchers.map((token, index, list) => (
            <button
              key={token.id}
              type="button"
              className={[
                "flex w-full items-center gap-3 p-3 text-left",
                index < list.length - 1 ? "border-b border-border" : "",
              ].join(" ")}
              onClick={() => {
                void navigate({
                  to: "/vouchers/$voucherAddress",
                  params: { voucherAddress: token.id },
                  search: { from: "wallet" },
                });
              }}
            >
              <TokenLogo token={token} size={34} />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm tracking-tight">{token.symbol}</p>
                <p className="truncate text-muted-foreground text-xs">{token.name}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-heading text-sm font-semibold tracking-tight">{token.amount}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="your-pools-title">
        <SectionHeader
          id="your-pools-title"
          title={<Trans>Your Pools</Trans>}
          action={<Trans>All pools</Trans>}
          actionTo="/pools"
        />
        <div className="border border-border bg-card">
          {ownedPoolsQuery.isPending ? (
            <div className="p-3 text-muted-foreground text-sm">
              <Trans>Loading pools…</Trans>
            </div>
          ) : null}
          {ownedPoolsQuery.isError ? (
            <div className="space-y-2 p-3">
              <p className="text-muted-foreground text-sm">
                <Trans>Couldn't load your pools.</Trans>
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-9 bg-card"
                onClick={() => ownedPoolsQuery.refetch()}
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
              <Button asChild variant="outline" className="h-9 w-full bg-card">
                <Link to="/pools/create/$step" params={{ step: "pool" }}>
                  <Trans>Create pool</Trans>
                </Link>
              </Button>
            </div>
          ) : null}
          {ownedPools.map((pool, index, list) => (
            <Link
              key={pool.address}
              to="/pools/$poolAddress"
              params={{ poolAddress: pool.address }}
              className={[
                "flex w-full items-center gap-3 p-3 text-left active:bg-muted",
                index < list.length - 1 ? "border-b border-border" : "",
              ].join(" ")}
            >
              <PoolLogo imageUrl={pool.imageUrl} name={pool.name} seed={pool.address} size={34} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-sm tracking-tight">{pool.name}</p>
                <p className="mt-0.5 text-muted-foreground text-xs">
                  {pool.voucherCount === 1 ? (
                    <Trans>1 voucher</Trans>
                  ) : (
                    <Trans>{pool.voucherCount} vouchers</Trans>
                  )}
                </p>
              </div>
              <RiArrowRightSLine
                className="size-5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
