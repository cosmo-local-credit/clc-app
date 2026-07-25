import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";
import { BackChevron, TokenLogo, type WalletToken } from "#/components/wallet";
import type { PoolVoucher } from "#/features/pools/api/pools-client";
import { usePoolVoucherTokens } from "#/features/pools/hooks/use-pool-voucher-tokens";
import { usePoolVouchers } from "#/features/pools/hooks/use-pool-vouchers";
import { useUserPoolByAddress } from "#/features/pools/hooks/use-user-pools";
import { PoolLogo } from "./pool-logo";

export function PoolDetailPage({ poolAddress }: { poolAddress: string }) {
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

      <section aria-labelledby="pool-vouchers-title" className="space-y-2">
        <h2 id="pool-vouchers-title" className="font-heading font-semibold text-base">
          <Trans>Vouchers in this pool</Trans>
        </h2>
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
      </section>
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
      to="/wallet/tokens/$tokenId"
      params={{ tokenId: voucher.tokenAddress.toLowerCase() }}
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
