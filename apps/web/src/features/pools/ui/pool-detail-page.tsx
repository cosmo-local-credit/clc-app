import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";
import { BackChevron, TokenLogo, type WalletToken } from "#/components/wallet";
import type { PoolVoucher } from "@clc/api/features/pools/client";
import { usePoolVoucherTokens } from "#/features/pools/hooks/use-pool-voucher-tokens";
import { usePoolVouchers } from "#/features/pools/hooks/use-pool-vouchers";
import { useUserPoolByAddress } from "#/features/pools/hooks/use-user-pools";
import { PoolLogo } from "./pool-logo";
import { PoolOfferingsPanel } from "./pool-offerings-panel";

export type PoolDetailTab = "offerings" | "vouchers";

const POOL_TABS: PoolDetailTab[] = ["offerings", "vouchers"];

export function PoolDetailPage({
  poolAddress,
  activeTab,
}: {
  poolAddress: string;
  activeTab: PoolDetailTab;
}) {
  const { t } = useLingui();
  const poolQuery = useUserPoolByAddress(poolAddress);
  const pool = poolQuery.data;
  const vouchers = usePoolVouchers(pool);
  const voucherTokens = usePoolVoucherTokens(vouchers);

  if (poolQuery.isPending) {
    return <DetailShell message={t`Loading pool…`} />;
  }
  if (poolQuery.isError) {
    return <DetailShell message={t`Couldn't load this pool.`} />;
  }
  if (!pool) {
    return <DetailShell message={t`Pool not found.`} />;
  }

  return (
    <div className="space-y-3">
      <BackChevron label={t`Pools`} to="/pools" />
      <section className="border border-border bg-card p-3">
        <div className="flex items-start gap-3">
          <PoolLogo imageUrl={pool.imageUrl} name={pool.name} seed={pool.address} size={42} />
          <div className="min-w-0 flex-1 overflow-hidden">
            <h1 className="truncate font-heading text-[1.375rem] font-bold leading-tight">
              {pool.name}
            </h1>
            <p className="mt-1 line-clamp-3 overflow-hidden text-muted-foreground text-xs break-words">
              {pool.description}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pool.tags.map((tag) => (
                <span
                  key={tag}
                  className="border border-border bg-muted px-1.5 py-0.5 text-[0.625rem]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Button asChild className="h-11 w-full">
        <Link to="/pools/$poolAddress/swap" params={{ poolAddress }}>
          <Trans>Swap</Trans>
        </Link>
      </Button>

      <div
        className="grid grid-cols-2 border border-border bg-card p-1"
        role="tablist"
        aria-label={t`Pool contents`}
      >
        {POOL_TABS.map((tab) => {
          const label = tab === "offerings" ? <Trans>Offerings</Trans> : <Trans>Vouchers</Trans>;
          const className = [
            "flex h-10 min-w-0 items-center justify-center px-1 text-[0.6875rem] font-semibold",
            activeTab === tab ? "bg-foreground text-background" : "text-muted-foreground",
          ].join(" ");

          if (activeTab === tab) {
            return (
              <button
                key={tab}
                type="button"
                id={`pool-tab-${tab}`}
                role="tab"
                aria-selected="true"
                aria-controls={`pool-panel-${tab}`}
                className={className}
              >
                {label}
              </button>
            );
          }

          return (
            <Link
              key={tab}
              id={`pool-tab-${tab}`}
              role="tab"
              aria-selected="false"
              aria-controls={`pool-panel-${tab}`}
              to="/pools/$poolAddress"
              params={{ poolAddress }}
              search={{ tab: tab === "offerings" ? undefined : tab }}
              // Switching panel on the same screen is not a navigation: Back
              // must leave the pool, not walk back through visited tabs.
              replace
              resetScroll={false}
              className={className}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {activeTab === "offerings" ? <PoolOfferingsPanel poolAddress={poolAddress} /> : null}

      {activeTab === "vouchers" ? (
        <div id="pool-panel-vouchers" role="tabpanel" aria-labelledby="pool-tab-vouchers">
          {vouchers.length === 0 ? (
            <div className="border border-border bg-card p-3 text-muted-foreground text-sm">
              <Trans>No vouchers in this pool yet.</Trans>
            </div>
          ) : (
            <div className="border border-border bg-card">
              {vouchers.map((voucher, index) => (
                <VoucherRow
                  key={voucher.id}
                  poolAddress={poolAddress}
                  voucher={voucher}
                  token={voucherTokens[index]}
                  isLast={index === vouchers.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function DetailShell({ message }: { message: string }) {
  const { t } = useLingui();
  return (
    <div className="space-y-3">
      <BackChevron label={t`Pools`} to="/pools" />
      <p className="border border-border bg-card p-3 text-muted-foreground text-sm">{message}</p>
    </div>
  );
}

function VoucherRow({
  poolAddress,
  voucher,
  token,
  isLast,
}: {
  poolAddress: string;
  voucher: PoolVoucher;
  token: WalletToken | undefined;
  isLast: boolean;
}) {
  return (
    <Link
      to="/vouchers/$voucherAddress"
      params={{ voucherAddress: voucher.tokenAddress.toLowerCase() }}
      search={{ poolAddress }}
      className={["flex items-center gap-3 p-3", isLast ? "" : "border-b border-border"].join(" ")}
    >
      {token ? <TokenLogo token={token} size={36} /> : null}
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="truncate font-bold text-sm tracking-tight">{voucher.name}</p>
      </div>
      {voucher.offerCount === null ? null : (
        <span className="shrink-0 text-primary text-[0.6875rem] font-semibold">
          {voucher.offerCount === 1 ? (
            <Trans>1 offer</Trans>
          ) : (
            <Trans>{voucher.offerCount} offers</Trans>
          )}
        </span>
      )}
    </Link>
  );
}
