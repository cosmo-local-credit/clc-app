import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { POOL_PRICE_INDEX_DECIMALS } from "@clc/core/features/pool-admin/logic";
import { formatTokenAmount, formatTokenAmountFixed } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";
import { Progress } from "#/components/ui/progress";
import { TokenLogo } from "#/components/wallet";
import { usePoolQuoterKind, usePoolVoucherRates } from "#/features/pools/hooks/use-pool-quoter";
import { usePoolTreasury } from "#/features/pools/hooks/use-pool-treasury";
import { type PoolHolding, buildPoolHoldings } from "#/features/pools/logic/pool-holdings";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";
import { useAccountTokensInfinite } from "#/features/wallet/hooks/use-account-balances";

/**
 * What the pool is holding, and how much more of each voucher it will take.
 *
 * Reads the chain rather than the catalog for the balances: a holding moves with
 * every swap, and the figure a reader is about to deposit against has to be the
 * one the contract will check. The catalog still supplies the names, the icons
 * and the steward's recorded cap, none of which are on chain in a readable form.
 */
export function PoolHoldingsPanel({ pool, vouchers }: { pool: UserPool; vouchers: PoolVoucher[] }) {
  const { t } = useLingui();
  const treasury = usePoolTreasury(pool, vouchers, true);
  // `priceIndex` exists only on RelativeQuoter, and the rate read normalizes a
  // reverted call to parity — so on an oracle- or decimal-quoted pool every
  // voucher would come back at 1:1 and the screen would state a valuation
  // nothing on chain supports. Ask only where the answer means something.
  const quoter = usePoolQuoterKind(pool);
  const isRelative = quoter.kind === "relative";
  const rates = usePoolVoucherRates(pool, vouchers, isRelative);
  // The indexer's view of the same address, which carries the vouchers the
  // catalog has not projected — a pool seeded at `initialize` holds tokens no
  // catalog row mentions, and a holdings screen that dropped them would report
  // a pool as emptier than it is.
  const indexed = useAccountTokensInfinite(pool.address);

  const holdings = buildPoolHoldings({
    pool,
    vouchers,
    treasury: treasury.data,
    indexedTokens: indexed.data?.pages.flatMap((page) => page.tokens),
    rates: isRelative ? rates.data : undefined,
    priced: isRelative,
  });
  const unit = pool.unitOfAccount ?? pool.symbol;

  const isPending = treasury.isPending && indexed.isPending && holdings.length === 0;
  const isError = treasury.isError && indexed.isError;

  return (
    <div
      id="pool-panel-holdings"
      role="tabpanel"
      aria-labelledby="pool-tab-holdings"
      className="space-y-3"
    >
      <section className="border border-border bg-card" aria-label={t`Pool balances`}>
        {isPending ? (
          <div className="p-3 text-muted-foreground text-sm">
            <Trans>Loading holdings…</Trans>
          </div>
        ) : null}
        {isError ? (
          <div className="space-y-2 p-3">
            <p className="text-muted-foreground text-sm">
              <Trans>Couldn't load holdings.</Trans>
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-9 bg-card"
              onClick={() => {
                void treasury.refetch();
                void indexed.refetch();
              }}
            >
              <Trans>Try again</Trans>
            </Button>
          </div>
        ) : null}
        {!isPending && !isError && holdings.length === 0 ? (
          <div className="p-3 text-muted-foreground text-sm">
            <Trans>This pool holds nothing yet.</Trans>
          </div>
        ) : null}
        {holdings.map((holding, index, list) => (
          <HoldingRow
            key={holding.tokenAddress}
            holding={holding}
            poolAddress={pool.address}
            unit={unit}
            isLast={index === list.length - 1}
          />
        ))}
      </section>
    </div>
  );
}

function HoldingRow({
  holding,
  poolAddress,
  unit,
  isLast,
}: {
  holding: PoolHolding;
  poolAddress: string;
  unit: string;
  isLast: boolean;
}) {
  const decimals = holding.decimals;
  // The logo and colour are derived from the address and symbol alone, so the
  // wallet's own mapper serves a pool's balance as well as a holder's.
  const token = accountTokenToWalletToken({
    id: 0,
    tokenAddress: holding.tokenAddress,
    tokenSymbol: holding.symbol,
    tokenName: holding.name,
    tokenDecimals: decimals ?? 18,
    balance: holding.balanceRaw,
    iconUrl: holding.iconUrl,
    lastDateBlock: "",
  });

  return (
    <Link
      to="/vouchers/$voucherAddress"
      params={{ voucherAddress: holding.tokenAddress }}
      search={{ poolAddress }}
      className={["block p-3", isLast ? "" : "border-b border-border"].join(" ")}
    >
      <div className="flex items-center gap-3">
        <TokenLogo token={token} size={36} />
        {/* The name alone, not the ticker. A steward reading their own pool
            knows it by what it is called; the symbol still appears below,
            against the rate and the amount it denominates. */}
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="truncate font-bold text-sm tracking-tight">{holding.name}</p>
          {/* The same line the vouchers tab prints, so one voucher reads the
              same way on both. Present only where the quoter publishes a rate:
              on an oracle- or decimal-quoted pool nothing was read, and parity
              is what the contract falls back to rather than what it was told. */}
          {holding.ratePpm === null ? null : (
            <p className="truncate font-mono text-muted-foreground text-xs">
              1 {holding.symbol} = {formatTokenAmount(holding.ratePpm, POOL_PRICE_INDEX_DECIMALS)}{" "}
              {unit}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          {/* Value in the pool's unit of account leads, with the voucher's own
              amount beneath it. The conversion is exact — the same arithmetic
              the limiter applies — so it carries no approximation sign. */}
          {holding.unitValueRaw === null ? (
            <p className="font-mono text-sm font-semibold tabular-nums">
              {decimals === null ? "—" : formatTokenAmount(holding.balanceRaw, decimals, 2)}{" "}
              {holding.symbol}
            </p>
          ) : (
            <>
              <p className="font-mono text-sm font-semibold tabular-nums">
                {formatTokenAmountFixed(holding.unitValueRaw, POOL_PRICE_INDEX_DECIMALS, 2)} {unit}
              </p>
              <p className="font-mono text-muted-foreground text-[0.6875rem] tabular-nums">
                {decimals === null ? "—" : formatTokenAmount(holding.balanceRaw, decimals, 2)}{" "}
                {holding.symbol}
              </p>
            </>
          )}
        </div>
      </div>

      <CapRow holding={holding} unit={unit} />
    </Link>
  );
}

/**
 * How much room the pool has left for this voucher.
 *
 * The four cases read differently on purpose. A recorded cap gets a bar, because
 * headroom is the number that decides whether a deposit will go through; a
 * blocked voucher says so in words, since a full bar and a closed door look the
 * same and mean different things; and the two "no cap" cases are separated
 * because one is a pool that takes anything and the other is a pool nobody has
 * told us about.
 *
 * The bar fills with what is *available*, not with what has been used. A
 * steward setting a 100 KES limit on an empty voucher is offering 100 KES of
 * credit, and a bar that reads empty at the moment the whole limit is on offer
 * says the opposite of the figure printed under it.
 */
function CapRow({ holding, unit }: { holding: PoolHolding; unit: string }) {
  const { t } = useLingui();
  const { cap, decimals, fillPercent, headroomRaw } = holding;

  if (cap.kind === "blocked") {
    return (
      <p className="mt-2 text-[0.6875rem] text-destructive">
        <Trans>Not accepting deposits</Trans>
      </p>
    );
  }

  if (cap.kind !== "capped" || decimals === null || fillPercent === null || headroomRaw === null) {
    return (
      <p className="mt-2 text-muted-foreground text-[0.6875rem]">
        {cap.kind === "uncapped" ? <Trans>No deposit limit</Trans> : <Trans>Limit not set</Trans>}
      </p>
    );
  }

  // Stated in the pool's unit of account where anything prices the voucher,
  // because that is the unit the limit was decided in. An unpriced pool falls
  // back to the voucher's own units rather than printing a currency figure no
  // rate supports.
  const { headroomUnitValueRaw, capUnitValueRaw } = holding;
  const priced = headroomUnitValueRaw !== null && capUnitValueRaw !== null;
  const available = priced
    ? formatTokenAmountFixed(headroomUnitValueRaw, POOL_PRICE_INDEX_DECIMALS, 2)
    : formatTokenAmount(headroomRaw, decimals, 2);
  const limit = priced
    ? formatTokenAmountFixed(capUnitValueRaw, POOL_PRICE_INDEX_DECIMALS, 2)
    : formatTokenAmount(cap.raw, decimals, 2);
  const denomination = priced ? unit : holding.symbol;

  return (
    <div className="mt-2">
      <Progress
        value={100 - fillPercent}
        aria-label={t`${holding.name} available credit`}
        className="h-1 w-full overflow-hidden bg-muted"
      />
      <p className="mt-1 font-mono text-muted-foreground text-[0.6875rem] tabular-nums">
        <Trans>
          {available} of {limit} {denomination} available credit
        </Trans>
      </p>
    </div>
  );
}
