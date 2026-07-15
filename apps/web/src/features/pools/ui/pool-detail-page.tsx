import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { RiMapPinLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { PoolsBackButton } from "./pools-back-button";
import type { PoolVoucherPlaceholder } from "#/features/pools/data/placeholder-pool-vouchers";
import { usePoolVouchers } from "#/features/pools/hooks/use-pool-vouchers";
import { useUserPoolByAddress } from "#/features/pools/hooks/use-user-pools";
import { PoolLogo } from "./pool-logo";

export function PoolDetailPage({ poolAddress }: { poolAddress: string }) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const poolQuery = useUserPoolByAddress(poolAddress);
  const pool = poolQuery.data;
  const vouchers = usePoolVouchers(pool);

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
      <PoolsBackButton label={t`Pools`} />
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
              <span className="border border-border bg-muted px-1.5 py-0.5 text-[0.625rem]">
                {vouchers.length === 1 ? (
                  <Trans>1 voucher</Trans>
                ) : (
                  <Trans>{vouchers.length} vouchers</Trans>
                )}
              </span>
            </div>
          </div>
        </div>
      </section>

      <Button
        className="h-11 w-full rounded-none"
        onClick={() => {
          void navigate({ to: "/pools/$poolAddress/swap", params: { poolAddress } });
        }}
      >
        <Trans>Swap in this pool</Trans>
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
                voucher={voucher}
                isLast={index === vouchers.length - 1}
              />
            ))}
          </div>
        )}
      </section>

      <p className="flex items-start gap-2 text-muted-foreground text-xs">
        <RiMapPinLine className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          <Trans>Open Market to browse each voucher's individual offers.</Trans>
        </span>
      </p>
    </div>
  );
}

function DetailShell({ message }: { message: string }) {
  const { t } = useLingui();
  return (
    <div className="space-y-3">
      <PoolsBackButton label={t`Pools`} />
      <p className="border border-border bg-card p-3 text-muted-foreground text-sm">{message}</p>
    </div>
  );
}

function VoucherRow({ voucher, isLast }: { voucher: PoolVoucherPlaceholder; isLast: boolean }) {
  return (
    <div
      className={["flex items-center gap-3 p-3", isLast ? "" : "border-b border-border"].join(" ")}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-[0.6875rem] font-bold">
        {voucher.symbol.slice(0, 2)}
      </span>
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="truncate font-bold text-sm tracking-tight">{voucher.name}</p>
        <p className="line-clamp-2 overflow-hidden text-muted-foreground text-xs break-words">
          {voucher.description}
        </p>
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
    </div>
  );
}
