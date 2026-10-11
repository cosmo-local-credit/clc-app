import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  RiArrowRightSLine,
  RiBankCardLine,
  RiDownloadLine,
  RiSendPlane2Line,
} from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { VoucherSheet } from "#/components/vouchers/voucher-sheet";
import { PoolLogo, SectionHeader, TokenLogo, type WalletToken } from "#/components/wallet";
import { useOwnedPoolsInfinite } from "#/features/pools/hooks/use-user-pools";
import { useLatestAccountTokens } from "#/features/wallet/hooks/use-account-balances";
import { usePartitionedVouchers } from "#/features/wallet/hooks/use-partitioned-vouchers";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";
import { CompleteProfileBanner } from "./complete-profile-banner";
import { MyCatalogSection } from "#/components/catalogs/my-catalog-section";
import { useVoucherSheetSelection } from "#/lib/navigation/use-voucher-sheet-selection";
import { parseVoucherAddress } from "#/lib/navigation/voucher-sheet-search";

function WalletVoucherRows({
  tokens,
  onOpen,
}: {
  tokens: readonly WalletToken[];
  onOpen: (address: `0x${string}`) => void;
}) {
  return tokens.map((token, index, list) => (
    <button
      key={token.id}
      type="button"
      className={[
        "flex w-full items-center gap-3 p-3 text-start",
        index < list.length - 1 ? "border-b border-border" : "",
      ].join(" ")}
      onClick={() => {
        const address = parseVoucherAddress(token.contractAddress ?? token.id);
        if (address) onOpen(address);
      }}
    >
      <TokenLogo token={token} size={34} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold tracking-tight">{token.symbol}</p>
        <p className="text-muted-foreground truncate text-xs">{token.name}</p>
      </div>
      <div className="shrink-0 text-end">
        <p className="font-heading text-sm font-semibold tracking-tight">{token.amount}</p>
      </div>
    </button>
  ));
}

/** Balances whose issuer has not resolved yet, below the rows that have. */
function UnresolvedVouchersRow({
  pending,
  failed,
  bordered,
  onRetry,
}: {
  pending: boolean;
  failed: boolean;
  bordered: boolean;
  onRetry: () => void;
}) {
  if (!pending && !failed) return null;
  return (
    <div className={["space-y-2 p-3", bordered ? "border-border border-t" : ""].join(" ")}>
      {pending ? (
        <p className="text-muted-foreground text-sm">
          <Trans>Loading vouchers…</Trans>
        </p>
      ) : null}
      {failed ? (
        <>
          <p className="text-muted-foreground text-sm">
            <Trans>Some vouchers couldn't load.</Trans>
          </p>
          <Button variant="outline" size="sm" className="bg-card h-9" onClick={onRetry}>
            <Trans>Try again</Trans>
          </Button>
        </>
      ) : null}
    </div>
  );
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
  const vouchersQuery = useLatestAccountTokens(address);
  const vouchers = vouchersQuery.data?.tokens.map(accountTokenToWalletToken) ?? [];
  const sheet = useVoucherSheetSelection();
  const sheetToken = vouchers.find((token) => token.id === sheet.voucher?.toLowerCase());
  const voucherGroups = usePartitionedVouchers(vouchers, address);
  // Rows are grouped as their owners arrive. The list waits, or fails, as a
  // whole only until the first one lands; after that an unresolved row is a
  // status line under the groups, so a new balance does not blank the screen.
  const resolved = voucherGroups.holdings.length + voucherGroups.issued.length > 0;
  const ownersPending = vouchers.length > 0 && !resolved && voucherGroups.pending;
  const ownersFailed =
    vouchers.length > 0 && !resolved && !voucherGroups.pending && voucherGroups.failed;
  const vouchersReady = vouchersQuery.isSuccess && vouchers.length > 0 && resolved;
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

      <CompleteProfileBanner address={address} />

      <section aria-label={t`Wallet actions`} className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {actions.map((action) => {
            const Icon = action.icon;
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

      <MyCatalogSection />

      {!vouchersReady ? (
        <section aria-labelledby="your-vouchers-title">
          <SectionHeader
            id="your-vouchers-title"
            title={<Trans>Your Vouchers</Trans>}
            action={<Trans>View all</Trans>}
            onAction={() => {
              void navigate({ to: "/wallet/vouchers" });
            }}
          />
          <div className="border-border bg-card border">
            {vouchersQuery.isPending || ownersPending ? (
              <div className="text-muted-foreground p-3 text-sm">
                <Trans>Loading vouchers…</Trans>
              </div>
            ) : null}
            {vouchersQuery.isError || ownersFailed ? (
              <div className="space-y-2 p-3">
                <p className="text-muted-foreground text-sm">
                  <Trans>Couldn't load vouchers.</Trans>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-card h-9"
                  onClick={() => {
                    void vouchersQuery.refetch();
                    void voucherGroups.refetch();
                  }}
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
                <Button asChild variant="outline" className="bg-card h-9 w-full">
                  <Link to="/vouchers/create/$step" params={{ step: "voucher" }}>
                    <Trans>Create voucher</Trans>
                  </Link>
                </Button>
              </div>
            ) : null}
          </div>
        </section>
      ) : (
        <>
          {voucherGroups.holdings.length > 0 ? (
            <section aria-labelledby="holdings-title">
              <SectionHeader id="holdings-title" title={<Trans>Holdings</Trans>} />
              <div className="border-border bg-card border">
                <WalletVoucherRows tokens={voucherGroups.holdings} onOpen={sheet.open} />
              </div>
            </section>
          ) : null}
          <section aria-labelledby="your-vouchers-title">
            <SectionHeader
              id="your-vouchers-title"
              title={<Trans>Your Vouchers</Trans>}
              action={<Trans>View all</Trans>}
              onAction={() => {
                void navigate({ to: "/wallet/vouchers" });
              }}
            />
            <div className="border-border bg-card border">
              {voucherGroups.issued.length === 0 &&
              !voucherGroups.pending &&
              !voucherGroups.failed ? (
                <div className="space-y-3 p-3">
                  <p className="text-muted-foreground text-sm">
                    <Trans>You didn't issue any of these.</Trans>
                  </p>
                  <Button asChild variant="outline" className="bg-card h-9 w-full">
                    <Link to="/vouchers/create/$step" params={{ step: "voucher" }}>
                      <Trans>Create voucher</Trans>
                    </Link>
                  </Button>
                </div>
              ) : (
                <WalletVoucherRows tokens={voucherGroups.issued} onOpen={sheet.open} />
              )}
              <UnresolvedVouchersRow
                pending={voucherGroups.pending}
                failed={voucherGroups.failed}
                bordered={voucherGroups.issued.length > 0}
                onRetry={() => {
                  void voucherGroups.refetch();
                }}
              />
            </div>
          </section>
        </>
      )}

      <section aria-labelledby="your-pools-title">
        <SectionHeader
          id="your-pools-title"
          title={<Trans>Your Pools</Trans>}
          action={<Trans>All pools</Trans>}
          actionTo="/pools"
        />
        <div className="border-border bg-card border">
          {ownedPoolsQuery.isPending ? (
            <div className="text-muted-foreground p-3 text-sm">
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
                className="bg-card h-9"
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
              <Button asChild variant="outline" className="bg-card h-9 w-full">
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
                "flex w-full items-center gap-3 p-3 text-start active:bg-muted",
                index < list.length - 1 ? "border-b border-border" : "",
              ].join(" ")}
            >
              <PoolLogo imageUrl={pool.imageUrl} name={pool.name} seed={pool.address} size={34} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold tracking-tight">{pool.name}</p>
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

      <VoucherSheet
        placeholder={
          sheetToken
            ? { name: sheetToken.name, symbol: sheetToken.symbol, iconUrl: sheetToken.iconUrl }
            : null
        }
        origin={{ from: "wallet" }}
      />
    </div>
  );
}
