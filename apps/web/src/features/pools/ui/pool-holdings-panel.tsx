import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { POOL_PRICE_INDEX_DECIMALS } from "@clc/core/features/pool-admin/logic";
import { formatTokenAmount, formatTokenAmountFixed } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";

import { usePoolHoldings } from "#/features/pools/hooks/use-pool-holdings";
import type { PoolHolding } from "#/features/pools/logic/pool-holdings";
import { PoolHoldingIdentity, PoolHoldingListPanel, PoolHoldingRowLink } from "./pool-holding-list";

/**
 * What the pool is holding, as a horizontal bar chart in its unit of account.
 *
 * Each bar is measured against the largest holding rather than against a cap,
 * so the chart answers "what is this pool made of" and nothing else. How much
 * more of each voucher the pool will take is the credit tab's question.
 */
export function PoolHoldingsPanel({ pool, vouchers }: { pool: UserPool; vouchers: PoolVoucher[] }) {
  const { t } = useLingui();
  const { holdings, unit, isPending, isError, refetch } = usePoolHoldings(pool, vouchers);

  return (
    <PoolHoldingListPanel
      tab="holdings"
      label={t`Pool balances`}
      isPending={isPending}
      isError={isError}
      isEmpty={holdings.length === 0}
      onRetry={refetch}
      messages={{
        loading: <Trans>Loading holdings…</Trans>,
        error: <Trans>Couldn't load holdings.</Trans>,
        empty: <Trans>This pool holds nothing yet.</Trans>,
      }}
    >
      {holdings.map((holding, index, list) => (
        <PoolHoldingRowLink
          key={holding.tokenAddress}
          holding={holding}
          poolAddress={pool.address}
          isLast={index === list.length - 1}
        >
          <div className="flex items-center gap-3">
            <PoolHoldingIdentity holding={holding} unit={unit} />
            <HoldingAmount holding={holding} unit={unit} />
          </div>
          <HoldingBar percent={holding.percentOfLargest} />
        </PoolHoldingRowLink>
      ))}
    </PoolHoldingListPanel>
  );
}

function HoldingAmount({ holding, unit }: { holding: PoolHolding; unit: string }) {
  const liquidity =
    holding.decimals === null || holding.liquidityRaw === null
      ? "—"
      : `${formatTokenAmount(holding.liquidityRaw, holding.decimals, 2)} ${holding.symbol}`;

  return (
    <div className="shrink-0 text-end">
      {/* Value in the pool's unit of account leads, with the voucher's own
          amount beneath it. The conversion is exact — the same arithmetic the
          limiter applies — so it carries no approximation sign. */}
      {holding.unitValueRaw === null ? (
        <p className="font-mono text-sm font-semibold tabular-nums">{liquidity}</p>
      ) : (
        <>
          <p className="font-mono text-sm font-semibold tabular-nums">
            {formatTokenAmountFixed(holding.unitValueRaw, POOL_PRICE_INDEX_DECIMALS, 2)} {unit}
          </p>
          <p className="font-mono text-muted-foreground text-[0.6875rem] tabular-nums">
            {liquidity}
          </p>
        </>
      )}
    </div>
  );
}

/**
 * The row's bar: full width for the pool's largest holding, the rest in
 * proportion. Decorative to assistive technology, since the figure it draws is
 * printed beside it.
 *
 * No track behind it. A filled track reads as a gauge, and the largest holding
 * drawn as a full gauge would say the pool is full of it, which a holding never
 * means. An unpriced row draws nothing: it is outside the unit the bars share.
 */
function HoldingBar({ percent }: { percent: number | null }) {
  if (percent === null) return null;
  return (
    <div className="mt-2 h-1.5 w-full" aria-hidden="true" data-slot="holding-bar">
      {/* A holding too small to show at this scale keeps a sliver, so a pool
          that holds a little of a voucher does not read as holding none. */}
      <div
        className={["h-full bg-info", percent > 0 ? "min-w-0.5" : ""].join(" ")}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
