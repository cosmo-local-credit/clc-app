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
  retrying,
  messages,
  children,
}: {
  tab: "holdings" | "credit";
  label: string;
  isPending: boolean;
  isError: boolean;
  isEmpty: boolean;
  onRetry: () => void;
  retrying: boolean;
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
                <Button variant="outline" tap pending={retrying} onClick={onRetry}>
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

/** One voucher's row, linking to its canonical page with a pool Back destination. */
export function PoolHoldingRowButton({
  poolAddress,
  holding,
  isLast,
  children,
}: {
  poolAddress: string;
  holding: PoolHolding;
  isLast: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      to="/vouchers/$voucherAddress"
      params={{ voucherAddress: holding.tokenAddress }}
      search={{ poolAddress }}
      className={["block w-full p-3 text-start", isLast ? "" : "border-b border-border"].join(" ")}
    >
      {children}
    </Link>
  );
}

/**
 * A row's bar, drawn the same way on both tabs: square-ended like the panel it
 * sits in, with a sliver kept for a share too small to show at this scale. The
 * tabs differ only in colour and in whether the bar is read out. A holdings bar
 * repeats the figure printed beside it, so it is hidden from assistive
 * technology; a credit bar is a gauge of the limit, announced under `label`.
 */
export function PoolHoldingBar({
  percent,
  fill,
  track = "",
  label,
}: {
  percent: number;
  fill: string;
  track?: string;
  label?: string;
}) {
  const a11y =
    label === undefined
      ? { "aria-hidden": true }
      : {
          role: "progressbar",
          "aria-label": label,
          "aria-valuemin": 0,
          "aria-valuemax": 100,
          "aria-valuenow": percent,
        };

  return (
    <div className={["mt-2 h-1.5 w-full", track].join(" ")} data-slot="holding-bar" {...a11y}>
      <div
        className={["h-full", fill, percent > 0 ? "min-w-0.5" : ""].join(" ")}
        style={{ width: `${percent}%` }}
      />
    </div>
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
