import type { PoolVoucher } from "@clc/api/features/pools/client";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import {
  RiAddLine,
  RiArrowLeftRightLine,
  RiArrowRightUpLine,
  RiQrCodeLine,
  RiSettings3Line,
} from "react-icons/ri";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { AddToCatalogButton } from "#/components/catalogs/add-to-catalog-button";
import { BackChevron, PoolLogo, TokenLogo, type WalletToken } from "#/components/wallet";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useAssetOwnerInfo } from "#/features/ownership/hooks/use-asset-owner-info";
import { MultisigOwnerNotice } from "#/components/safe/multisig-owner-notice";
import { usePoolVoucherRates } from "#/features/pools/hooks/use-pool-quoter";
import { usePoolVoucherTokens } from "#/features/pools/hooks/use-pool-voucher-tokens";
import { usePoolVouchersWithStatus } from "#/features/pools/hooks/use-pool-vouchers";
import { useUserPoolByAddress } from "#/features/pools/hooks/use-user-pools";
import { POOL_PRICE_INDEX_DECIMALS } from "@clc/core/features/pool-admin/logic";
import { PoolActivityPanel } from "./pool-activity-panel";
import { PoolControlsPanel } from "./pool-controls-panel";
import { PoolCreditPanel } from "./pool-credit-panel";
import { PoolHoldingsPanel } from "./pool-holdings-panel";
import { PoolOfferingsPanel } from "./pool-offerings-panel";
import { PoolReceiveSheet } from "./pool-receive-sheet";
import { PoolVoucherSheet } from "./pool-voucher-sheet";
import { PoolWantsPanel } from "./pool-wants-panel";

export type PoolDetailTab = "offerings" | "wants" | "vouchers" | "holdings" | "credit" | "activity";

// Holdings and credit sit side by side because they read the same rows two
// ways: what the pool is made of, and how much more of each it will take.
const POOL_TABS: PoolDetailTab[] = [
  "offerings",
  "wants",
  "vouchers",
  "holdings",
  "credit",
  "activity",
];

const TAB_LABELS: Record<PoolDetailTab, ReactNode> = {
  offerings: <Trans>Offerings</Trans>,
  wants: <Trans>Wants</Trans>,
  vouchers: <Trans>Vouchers</Trans>,
  // Its own message rather than the wallet's: a tab has a fifth of a 360px
  // row, and a translation that suits a section heading — Italian's
  // "Disponibilità" — does not fit one.
  holdings: <Trans context="Pool tab">Holdings</Trans>,
  credit: <Trans>Credit</Trans>,
  activity: <Trans>Activity</Trans>,
};

export function PoolDetailPage({
  poolAddress,
  activeTab,
  wantId,
}: {
  poolAddress: string;
  activeTab: PoolDetailTab;
  wantId?: string;
}) {
  const { t } = useLingui();
  const poolQuery = useUserPoolByAddress(poolAddress);
  const pool = poolQuery.data;
  // Retired vouchers are dropped here and not in the hook. `list-pool-vouchers`
  // deliberately does not filter `active` — pool composition is an operations
  // view, and the swap picker reads the same list, where a retired voucher must
  // stay selectable as a *source* so a holder is never left unable to swap out
  // of one. This is the browse list, where it is only an entry to a page that no
  // longer resolves.
  // Approval exclusion needs the complete, unfiltered membership rather than
  // the first page of active browse rows. The registry remains authoritative;
  // this catalog set is the fallback for older pools without a registry.
  const poolVouchersQuery = usePoolVouchersWithStatus(pool, { all: true });
  const poolVouchers = poolVouchersQuery.vouchers;
  const vouchers = poolVouchers.filter((voucher) => voucher.active);
  const voucherTokens = usePoolVoucherTokens(vouchers);
  const auth = useAuthStatus();
  // The same rule the voucher screen applies: the backend session's address
  // must be the catalog owner, or the session must be a superadmin. clc-core
  // decides for real; this only keeps the button off everyone else's screen.
  // The owner itself, or a signer of the Safe that owns the pool.
  const ownerInfo = useAssetOwnerInfo(poolAddress, pool?.ownerAddress);
  const isPoolOwner =
    auth.isAuthenticated &&
    !!pool &&
    !!auth.session?.address &&
    !!pool.ownerAddress &&
    ownerInfo.canManage;
  const canEditDetails =
    auth.isAuthenticated && !!pool && (auth.session?.role === "SUPERADMIN" || isPoolOwner);
  // On-chain management is narrower than editing the record. Every call behind
  // it is `onlyOwner` on a contract the pool's owner deployed, so a superadmin —
  // who may correct the catalog for anyone — would only be signing a revert.
  const canManageOnChain = isPoolOwner;
  const rates = usePoolVoucherRates(pool, vouchers, canManageOnChain);
  const [managing, setManaging] = useState<PoolVoucher | null>(null);
  const [approving, setApproving] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const visibleTabs = auth.isAuthenticated
    ? POOL_TABS
    : POOL_TABS.filter((tab) => tab === "offerings" || tab === "wants" || tab === "vouchers");

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
      <BackChevron
        label={wantId ? t`Want` : t`Pools`}
        to={wantId ? `/wants/${wantId}` : "/market"}
        search={wantId ? undefined : { scope: "pools" }}
      />
      <section className="border border-border bg-card p-3">
        <div className="flex items-start gap-3">
          <PoolLogo imageUrl={pool.imageUrl} name={pool.name} seed={pool.address} size={42} />
          <div className="min-w-0 flex-1 overflow-hidden">
            <h1 className="truncate font-heading text-[1.75rem] font-bold leading-tight">
              {pool.name}
            </h1>
            <MultisigOwnerNotice info={ownerInfo.info} />
            <p
              dir="auto"
              className="mt-1 line-clamp-3 overflow-hidden text-muted-foreground text-xs break-words"
            >
              {pool.description}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pool.tags.map((tag) => (
                <Badge key={tag} variant="muted" size="sm">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* The three-up action row the wallet screen already uses, so a pool's
          actions are read the same way as every other screen's: the icon over
          a 12px label, which fits a third of a 360px row in every catalog. */}
      {auth.isAuthenticated ? (
        <section className="grid grid-cols-3 gap-2" aria-label={t`Pool actions`}>
          <Button asChild size="lg" className="flex-col gap-1 px-1 text-xs leading-tight">
            <Link to="/pools/$poolAddress/swap" params={{ poolAddress }}>
              <RiArrowLeftRightLine className="size-4" aria-hidden="true" />
              <Trans>Swap</Trans>
            </Link>
          </Button>
          {/* A shortcut into the ordinary send flow with the pool as the
            recipient, rather than a flow of its own. Back returns here on its
            own: BackChevron prefers real history over its deep-link fallback.
            `returnPool` rides along to the receipt so finishing the send lands
            back on this pool rather than on the wallet. */}
          <Button
            asChild
            variant="outline"
            size="lg"
            className="flex-col gap-1 px-1 text-xs leading-tight"
          >
            <Link
              to="/wallet/send/amount"
              search={{
                recipient: pool.address,
                recipientLabel: pool.name,
                returnPool: pool.address,
              }}
            >
              <RiArrowRightUpLine className="size-4" aria-hidden="true" />
              <Trans>Deposit</Trans>
            </Link>
          </Button>
          {/* The sheet's own title carries "Receive vouchers"; the trigger stays a
            one-word label so all three fit a 360px row. */}
          <Button
            variant="info"
            size="lg"
            className="flex-col gap-1 px-1 text-xs leading-tight"
            onClick={() => setReceiving(true)}
          >
            <RiQrCodeLine className="size-4" aria-hidden="true" />
            <Trans>Receive</Trans>
          </Button>
        </section>
      ) : null}

      {auth.isAuthenticated ? (
        <>
          <PoolReceiveSheet pool={pool} open={receiving} onClose={() => setReceiving(false)} />
          <AddToCatalogButton kind="pool" resourceId={pool.id} address={pool.address} tap />
        </>
      ) : null}

      {canEditDetails ? (
        <PoolControlsPanel pool={pool} vouchers={vouchers} canManageOnChain={canManageOnChain} />
      ) : null}

      <div
        className="flex overflow-x-auto border border-border bg-card p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label={t`Pool contents`}
      >
        {visibleTabs.map((tab) => {
          const label = TAB_LABELS[tab];
          // Five tabs leave about 60px a label at 360px. A label of two words
          // wraps onto a second line centred under the first; a single word
          // has to fit, which is what the tab's own `context` is for.
          const className = [
            "flex h-10 min-w-20 flex-1 items-center justify-center px-2 text-center text-2xs leading-tight font-semibold",
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

      {activeTab === "wants" ? <PoolWantsPanel poolAddress={poolAddress} /> : null}

      {activeTab === "vouchers" ? (
        <div
          id="pool-panel-vouchers"
          role="tabpanel"
          aria-labelledby="pool-tab-vouchers"
          className="space-y-3"
        >
          {canManageOnChain ? (
            <Button variant="outline" tap className="w-full" onClick={() => setApproving(true)}>
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

      {activeTab === "holdings" ? <PoolHoldingsPanel pool={pool} vouchers={vouchers} /> : null}

      {activeTab === "credit" ? <PoolCreditPanel pool={pool} vouchers={vouchers} /> : null}

      {activeTab === "activity" ? <PoolActivityPanel pool={pool} /> : null}

      {canManageOnChain ? (
        <PoolVoucherSheet
          pool={pool}
          poolVouchers={poolVouchers}
          voucher={null}
          open={approving}
          onClose={() => setApproving(false)}
        />
      ) : null}

      {canManageOnChain && managing ? (
        <PoolVoucherSheet
          pool={pool}
          poolVouchers={poolVouchers}
          voucher={managing}
          open
          onClose={() => setManaging(null)}
        />
      ) : null}
    </div>
  );
}

function DetailShell({ message }: { message: string }) {
  const { t } = useLingui();
  return (
    <div className="space-y-3">
      <BackChevron label={t`Pools`} to="/market" search={{ scope: "pools" }} />
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
  const voucherAddress = voucher.tokenAddress.toLowerCase();
  return (
    <div className={["flex items-center", isLast ? "" : "border-b border-border"].join(" ")}>
      <Link
        to="/vouchers/$voucherAddress"
        params={{ voucherAddress }}
        search={{ poolAddress }}
        className="flex min-w-0 flex-1 items-center gap-3 p-3 text-start"
      >
        {token ? <TokenLogo token={token} size={36} /> : null}
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="truncate font-semibold text-sm">{voucher.name}</p>
          {ratePpm === undefined ? null : (
            <p className="truncate font-mono text-muted-foreground text-xs">
              1 {voucher.symbol} ={" "}
              {formatTokenAmount(ratePpm.toString(), POOL_PRICE_INDEX_DECIMALS)} {unitSymbol}
            </p>
          )}
        </div>
      </Link>
      {/* Getting this voucher out of the pool is one tap from its row: the
          pool's swap opens with it already chosen under "You receive". A
          sibling of the row link, not inside it — links do not nest. Filled in
          the brand colour, like the pool's own Swap, so it does not read as
          part of the white row. */}
      <Button asChild tap className={onManage ? undefined : "me-3"}>
        <Link
          to="/pools/$poolAddress/swap"
          params={{ poolAddress }}
          search={{ receive: voucherAddress }}
          aria-label={t`Swap for ${voucher.symbol}`}
        >
          <RiArrowLeftRightLine className="size-3.5" aria-hidden="true" />
          <Trans>Swap</Trans>
        </Link>
      </Button>
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
