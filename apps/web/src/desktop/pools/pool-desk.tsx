import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

import { PoolMain, usePoolDeskModel, usePoolDeskReceive } from "#/desktop/pools/pool-main";
import { PoolSwapColumn } from "#/desktop/pools/pool-swap-column";
import { DeskCanvas, DeskDetail } from "#/desktop/ui/page";

export function PoolDesk({
  poolAddress,
  swapActive = false,
}: {
  poolAddress: string;
  /** The swap route lands with the swap's first amount focused. */
  swapActive?: boolean;
}) {
  const receive = usePoolDeskReceive();
  return (
    <PoolDeskFrame
      poolAddress={poolAddress}
      side={
        <PoolSwapColumn
          poolAddress={poolAddress}
          receiveTokenAddress={receive}
          focused={swapActive}
        />
      }
    />
  );
}

/**
 * The pool page as a detail page: the pool in the main column, and whatever
 * the caller docks in the 360px side column (the swap, or its receipt).
 */
export function PoolDeskFrame({
  poolAddress,
  side,
  dimmed = false,
}: {
  poolAddress: string;
  side: ReactNode;
  /** The receipt greys the pool behind it, as the swap it replaced is done. */
  dimmed?: boolean;
}) {
  const { t } = useLingui();
  const model = usePoolDeskModel(poolAddress);
  const pool = model.pool;
  if (model.poolQuery.isPending || model.poolQuery.isError || !pool) {
    return (
      <DeskCanvas>
        <p className="text-sm text-muted-foreground">
          {model.poolQuery.isPending
            ? t`Loading pool…`
            : model.poolQuery.isError
              ? t`Couldn't load this pool.`
              : t`Pool not found.`}
        </p>
      </DeskCanvas>
    );
  }
  const main = <PoolMain model={{ ...model, pool }} />;
  return (
    <DeskDetail
      main={
        dimmed ? (
          <div inert className="pointer-events-none grid min-w-0 gap-6 opacity-40">
            {main}
          </div>
        ) : (
          main
        )
      }
      side={side}
    />
  );
}
