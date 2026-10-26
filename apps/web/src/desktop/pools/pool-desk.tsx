import { DeskSplit } from "#/desktop/ui/inspector";
import { PoolMain, usePoolDeskReceive } from "#/desktop/pools/pool-main";
import { PoolSwapColumn } from "#/desktop/pools/pool-swap-column";

export function PoolDesk({
  poolAddress,
  swapActive = false,
}: {
  poolAddress: string;
  /** The swap route focuses the column and dims the pool. */
  swapActive?: boolean;
}) {
  const receive = usePoolDeskReceive();
  return (
    <div className="flex h-full min-h-0">
      <DeskSplit
        dimmed={swapActive}
        main={<PoolMain poolAddress={poolAddress} />}
        side={
          <PoolSwapColumn
            poolAddress={poolAddress}
            receiveTokenAddress={receive}
            focused={swapActive}
          />
        }
      />
    </div>
  );
}
