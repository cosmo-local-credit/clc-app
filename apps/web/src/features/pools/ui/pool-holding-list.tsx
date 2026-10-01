import { POOL_PRICE_INDEX_DECIMALS } from "@clc/core/features/pool-admin/logic";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button";
import { TokenLogo } from "#/components/wallet";
import type { PoolHolding } from "#/features/pools/logic/pool-holdings";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";

/**
 * The tab panel the holdings and credit tabs share: one outlined list of the
 * pool's vouchers, with the loading, error and empty states in its place.
 */
export function PoolHoldingListPanel({
  tab,
  label,
  isPending,
  isError,
  isEmpty,
  onRetry,
  messages,
  children,
}: {
  tab: "holdings" | "credit";
  label: string;
  isPending: boolean;
  isError: boolean;
  isEmpty: boolean;
  onRetry: () => void;
  messages: { loading: ReactNode; error: ReactNode; empty: ReactNode };
  children: ReactNode;
}) {
  return (
    <div
      id={`pool-panel-${tab}`}
      role="tabpanel"
      aria-labelledby={`pool-tab-${tab}`}
      className="space-y-3"
    >
      <section className="border border-border bg-card" aria-label={label}>
        {isPending ? (
          <div className="p-3 text-muted-foreground text-sm">{messages.loading}</div>
        ) : (
          <>
            {/* Above the rows rather than instead of them: with both chain and
                indexer down, the catalog can still name what the pool lists. */}
            {isError ? (
              <div className="space-y-2 p-3">
                <p className="text-muted-foreground text-sm">{messages.error}</p>
                <Button variant="outline" size="sm" className="h-9 bg-card" onClick={onRetry}>
                  <Trans>Try again</Trans>
                </Button>
              </div>
            ) : null}
            {!isError && isEmpty ? (
              <div className="p-3 text-muted-foreground text-sm">{messages.empty}</div>
            ) : null}
            {children}
          </>
        )}
      </section>
    </div>
  );
}

/** One voucher's row, linking to its page with the pool kept in context. */
export function PoolHoldingRowLink({
  holding,
  poolAddress,
  isLast,
  children,
}: {
  holding: PoolHolding;
  poolAddress: string;
  isLast: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      to="/vouchers/$voucherAddress"
      params={{ voucherAddress: holding.tokenAddress }}
      search={{ poolAddress }}
      className={["block p-3", isLast ? "" : "border-b border-border"].join(" ")}
    >
      {children}
    </Link>
  );
}

/** The logo, the name and the pool's rate — what a row is about, on both tabs. */
export function PoolHoldingIdentity({ holding, unit }: { holding: PoolHolding; unit: string }) {
  // The logo and colour are derived from the address and symbol alone, so the
  // wallet's own mapper serves a pool's balance as well as a holder's.
  const token = accountTokenToWalletToken({
    id: 0,
    tokenAddress: holding.tokenAddress,
    tokenSymbol: holding.symbol,
    tokenName: holding.name,
    tokenDecimals: holding.decimals ?? 18,
    balance: holding.liquidityRaw ?? "0",
    iconUrl: holding.iconUrl,
    lastDateBlock: "",
  });

  return (
    <>
      <TokenLogo token={token} size={36} />
      {/* The name alone, not the ticker. A steward reading their own pool
          knows it by what it is called; the symbol still appears below,
          against the rate and the amount it denominates. */}
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="truncate font-bold text-sm tracking-tight">{holding.name}</p>
        {/* The same line the vouchers tab prints, so one voucher reads the
            same way on every tab. Present only where the quoter publishes a
            rate: on an oracle- or decimal-quoted pool nothing was read, and
            parity is what the contract falls back to rather than what it was
            told. */}
        {holding.ratePpm === null ? null : (
          <p className="truncate font-mono text-muted-foreground text-xs">
            1 {holding.symbol} = {formatTokenAmount(holding.ratePpm, POOL_PRICE_INDEX_DECIMALS)}{" "}
            {unit}
          </p>
        )}
      </div>
    </>
  );
}
