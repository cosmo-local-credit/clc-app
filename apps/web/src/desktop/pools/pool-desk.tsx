import { useLingui } from "@lingui/react/macro";
import { type ReactNode, useState } from "react";

import { PoolActivityDetailSide } from "#/desktop/pools/detail/pool-activity-detail-desk";
import { PoolControlSide } from "#/desktop/pools/detail/pool-manage-desk";
import { PoolProfileSide } from "#/desktop/pools/detail/pool-profile-desk";
import type { PoolSide } from "#/desktop/pools/detail/pool-side-panel";
import { PoolVoucherEditorSide } from "#/desktop/pools/detail/pool-voucher-editor-desk";
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
      key={poolAddress}
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
 * the caller docks in the 360px side column (the swap, or its receipt). An
 * owner tool, a voucher's settings or an activity row's details take the side
 * column's place until closed.
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
  const [panel, setPanel] = useState<PoolSide | null>(null);
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
  const close = () => setPanel(null);
  const main = <PoolMain model={{ ...model, pool }} side={panel} onOpenSide={setPanel} />;
  let docked: ReactNode = side;
  if (panel && !dimmed) {
    switch (panel.kind) {
      case "details":
        docked = <PoolProfileSide pool={pool} privateInfo={model.privateInfo} onClose={close} />;
        break;
      case "approve":
      case "voucher":
        docked = (
          <PoolVoucherEditorSide
            key={panel.kind === "voucher" ? panel.voucher.tokenAddress : "approve"}
            pool={pool}
            poolVouchers={model.poolVouchers}
            voucher={panel.kind === "voucher" ? panel.voucher : null}
            onClose={close}
          />
        );
        break;
      case "activity":
        docked = (
          <PoolActivityDetailSide
            key={panel.entry.key}
            poolAddress={pool.address}
            entry={panel.entry}
            onClose={close}
          />
        );
        break;
      default:
        docked = (
          <PoolControlSide
            key={panel.kind}
            side={panel}
            pool={pool}
            vouchers={model.poolVouchers}
            canManageOnChain={model.canManageOnChain}
            viewerAddress={model.auth.session?.address}
            onClose={close}
          />
        );
    }
  }
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
      side={docked}
    />
  );
}
