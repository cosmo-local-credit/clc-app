import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { POOL_PRICE_INDEX_DECIMALS } from "@clc/core/features/pool-admin/logic";
import { formatTokenAmount, formatTokenAmountFixed } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";

import { usePoolHoldings } from "#/features/pools/hooks/use-pool-holdings";
import type { PoolHolding } from "#/features/pools/logic/pool-holdings";
import {
  PoolHoldingBar,
  PoolHoldingIdentity,
  PoolHoldingListPanel,
  PoolHoldingRowButton,
} from "./pool-holding-list";

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
        <PoolHoldingRowButton
          key={holding.tokenAddress}
          poolAddress={pool.address}
          holding={holding}
          isLast={index === list.length - 1}
        >
          <div className="flex items-center gap-3">
            <PoolHoldingIdentity holding={holding} unit={unit} />
            <HoldingAmount holding={holding} unit={unit} />
          </div>
          {/* Full width for the pool's largest holding, the rest in proportion.
              No track behind it: a filled track reads as a gauge, and the
              largest holding drawn as a full gauge would say the pool is full
              of it, which a holding never means. An unpriced row draws
              nothing: it is outside the unit the bars share. */}
          {holding.percentOfLargest === null ? null : (
            <PoolHoldingBar percent={holding.percentOfLargest} fill="bg-info" />
          )}
        </PoolHoldingRowButton>
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
