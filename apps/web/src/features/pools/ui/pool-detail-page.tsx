import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { RiAddLine, RiPencilLine, RiSettings3Line } from "react-icons/ri";
import { Button } from "#/components/ui/button";
import { BackChevron, TokenLogo, type WalletToken } from "#/components/wallet";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { usePoolVoucherRates } from "#/features/pools/hooks/use-pool-quoter";
import { usePoolVoucherTokens } from "#/features/pools/hooks/use-pool-voucher-tokens";
import { usePoolVouchers } from "#/features/pools/hooks/use-pool-vouchers";
import { useUserPoolByAddress } from "#/features/pools/hooks/use-user-pools";
import { POOL_PRICE_INDEX_DECIMALS } from "@clc/core/features/pool-admin/logic";
import { PoolControlsPanel } from "./pool-controls-panel";
import { PoolLogo } from "./pool-logo";
import { PoolOfferingsPanel } from "./pool-offerings-panel";
import { PoolProfileEditorSheet } from "./pool-profile-editor-sheet";
import { PoolVoucherSheet } from "./pool-voucher-sheet";

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
  const auth = useAuthStatus();
  // The same rule the voucher screen applies: the backend session's address
  // must be the catalog owner, or the session must be a superadmin. clc-core
  // decides for real; this only keeps the button off everyone else's screen.
  const isPoolOwner =
    auth.isAuthenticated &&
    !!pool &&
    !!auth.session?.address &&
    !!pool.ownerAddress &&
    auth.session.address.toLowerCase() === pool.ownerAddress.toLowerCase();
  const canEditDetails =
    auth.isAuthenticated && !!pool && (auth.session?.role === "SUPERADMIN" || isPoolOwner);
  // On-chain management is narrower than editing the record. Every call behind
  // it is `onlyOwner` on a contract the pool's owner deployed, so a superadmin —
  // who may correct the catalog for anyone — would only be signing a revert.
  const canManageOnChain = isPoolOwner;
  const rates = usePoolVoucherRates(pool, vouchers, canManageOnChain);
  const [managing, setManaging] = useState<PoolVoucher | null>(null);
  const [approving, setApproving] = useState(false);

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

      {canEditDetails ? <EditPoolDetails pool={pool} /> : null}

      {canManageOnChain ? <PoolControlsPanel pool={pool} vouchers={vouchers} /> : null}

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

      {activeTab === "offerings" ? (
        <PoolOfferingsPanel poolAddress={poolAddress} vouchers={vouchers} />
      ) : null}

      {activeTab === "vouchers" ? (
        <div
          id="pool-panel-vouchers"
          role="tabpanel"
          aria-labelledby="pool-tab-vouchers"
          className="space-y-3"
        >
          {canManageOnChain ? (
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-full bg-card"
              onClick={() => setApproving(true)}
            >
              <RiAddLine className="size-4" aria-hidden="true" />
              <Trans>Approve voucher</Trans>
            </Button>
          ) : null}

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
                  unitSymbol={pool.unitOfAccount ?? pool.symbol}
                  ratePpm={rates.data?.get(voucher.tokenAddress.toLowerCase())}
                  onManage={canManageOnChain ? () => setManaging(voucher) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}

      {canManageOnChain ? (
        <PoolVoucherSheet
          pool={pool}
          poolVouchers={vouchers}
          voucher={null}
          currentRatePpm={undefined}
          rateIsPending={false}
          open={approving}
          onClose={() => setApproving(false)}
        />
      ) : null}

      {canManageOnChain && managing ? (
        <PoolVoucherSheet
          pool={pool}
          poolVouchers={vouchers}
          voucher={managing}
          currentRatePpm={rates.data?.get(managing.tokenAddress.toLowerCase())}
          rateIsPending={rates.isEnabled && rates.isPending}
          open
          onClose={() => setManaging(null)}
        />
      ) : null}
    </div>
  );
}

/** The owner's way into the catalog record; a button plus the sheet it opens. */
function EditPoolDetails({ pool }: { pool: UserPool }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-9 w-full bg-card"
        onClick={() => setEditing(true)}
      >
        <RiPencilLine className="size-4" aria-hidden="true" />
        <Trans>Edit details</Trans>
      </Button>
      <PoolProfileEditorSheet open={editing} pool={pool} onClose={() => setEditing(false)} />
    </>
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
  unitSymbol,
  ratePpm,
  onManage,
}: {
  poolAddress: string;
  voucher: PoolVoucher;
  token: WalletToken | undefined;
  isLast: boolean;
  unitSymbol: string;
  /** The pool's rate for this voucher. Only read for owners, so usually absent. */
  ratePpm: bigint | undefined;
  /** Present only for the pool's owner; the row stays a plain link for everyone else. */
  onManage?: () => void;
}) {
  const { t } = useLingui();
  return (
    <div className={["flex items-center", isLast ? "" : "border-b border-border"].join(" ")}>
      <Link
        to="/vouchers/$voucherAddress"
        params={{ voucherAddress: voucher.tokenAddress.toLowerCase() }}
        search={{ poolAddress }}
        className="flex min-w-0 flex-1 items-center gap-3 p-3"
      >
        {token ? <TokenLogo token={token} size={36} /> : null}
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="truncate font-bold text-sm tracking-tight">{voucher.name}</p>
          {ratePpm === undefined ? null : (
            <p className="truncate font-mono text-muted-foreground text-xs">
              1 {voucher.symbol} ={" "}
              {formatTokenAmount(ratePpm.toString(), POOL_PRICE_INDEX_DECIMALS)} {unitSymbol}
            </p>
          )}
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
      {onManage ? (
        <button
          type="button"
          aria-label={t`Manage ${voucher.symbol}`}
          onClick={onManage}
          className="flex size-11 shrink-0 items-center justify-center text-muted-foreground"
        >
          <RiSettings3Line className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
