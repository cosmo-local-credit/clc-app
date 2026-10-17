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
 * How much more of each voucher the pool will take — the credit its limits
 * extend to each issuer, and how much of it is still on offer.
 */
export function PoolCreditPanel({ pool, vouchers }: { pool: UserPool; vouchers: PoolVoucher[] }) {
  const { t } = useLingui();
  const { holdings, unit, isPending, capsPending, isError, isFetching, refetch } = usePoolHoldings(
    pool,
    vouchers,
  );

  return (
    <PoolHoldingListPanel
      tab="credit"
      label={t`Pool credit limits`}
      isPending={isPending || capsPending}
      isError={isError}
      isEmpty={holdings.length === 0}
      onRetry={refetch}
      retrying={isFetching}
      messages={{
        loading: <Trans>Loading credit limits…</Trans>,
        error: <Trans>Couldn't load credit limits.</Trans>,
        empty: <Trans>No vouchers in this pool yet.</Trans>,
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
          </div>
          <CreditLine holding={holding} unit={unit} />
        </PoolHoldingRowButton>
      ))}
    </PoolHoldingListPanel>
  );
}

/**
 * How much credit the pool still extends to this voucher.
 *
 * The four cases read differently on purpose. A recorded limit gets a bar,
 * because the credit left is the number that decides whether a deposit will go
 * through; a zero limit says so in words, since an empty bar and a closed door
 * look the same and mean different things; and the two "no limit" cases are
 * separated because one is a pool that takes anything and the other is a limit
 * nothing could read.
 *
 * The bar fills with what is *available*, not with what has been used. A
 * steward setting a 100 KES limit on an empty voucher is offering 100 KES of
 * credit, and a bar that reads empty at the moment the whole limit is on offer
 * says the opposite of the figure printed under it.
 */
function CreditLine({ holding, unit }: { holding: PoolHolding; unit: string }) {
  const { t } = useLingui();
  const { cap, decimals, fillPercent, headroomRaw } = holding;

  if (cap.kind === "blocked") {
    // A steward's setting, not a fault: a voucher admitted before its limit is
    // decided carries zero. Muted like the other no-figure states.
    return (
      <p className="mt-2 text-muted-foreground text-[0.6875rem]">
        <Trans>No credit offered</Trans>
      </p>
    );
  }

  if (cap.kind !== "capped" || decimals === null || fillPercent === null || headroomRaw === null) {
    return (
      <p className="mt-2 text-muted-foreground text-[0.6875rem]">
        {cap.kind === "uncapped" ? (
          <Trans>No credit limit</Trans>
        ) : (
          <Trans>Credit limit unknown</Trans>
        )}
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
    <>
      <PoolHoldingBar
        percent={100 - fillPercent}
        fill="bg-primary"
        track="bg-muted"
        label={t`${holding.name} available credit`}
      />
      <p className="mt-1 font-mono text-muted-foreground text-[0.6875rem] tabular-nums">
        <Trans>
          {available} of {limit} {denomination} available credit
        </Trans>
      </p>
    </>
  );
}
