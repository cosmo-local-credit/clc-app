import { useLingui } from "@lingui/react/macro";
import { type ReactNode, useEffect } from "react";

import { Button } from "#/components/ui/button";
import {
  PoolActivityDetailSide,
  PoolActivityMissingSide,
} from "#/desktop/pools/detail/pool-activity-detail-desk";
import { PoolControlSide } from "#/desktop/pools/detail/pool-manage-desk";
import { PoolProfileSide } from "#/desktop/pools/detail/pool-profile-desk";
import type { PoolSide } from "#/desktop/pools/detail/pool-side-panel";
import { PoolVoucherEditorSide } from "#/desktop/pools/detail/pool-voucher-editor-desk";
import { type PoolActivityFeed, usePoolActivityFeed } from "#/desktop/pools/pool-activity-feed";
import {
  PoolMain,
  usePoolDeskModel,
  usePoolDeskReceive,
  usePoolDeskRequestedTab,
} from "#/desktop/pools/pool-main";
import {
  type PoolSideRequest,
  requestForSide,
  usePoolSideNavigation,
} from "#/desktop/pools/pool-side-state";
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
 * The side panel the URL names, matched to what has loaded. A tool the viewer
 * may not use is no panel at all, so a copied link cannot open one.
 */
function resolvePoolSide(
  request: PoolSideRequest | null,
  model: ReturnType<typeof usePoolDeskModel>,
  activity: PoolActivityFeed,
): PoolSide | null {
  if (!request) return null;
  switch (request.kind) {
    case "tool":
      if (request.tool === "details") return model.canEditDetails ? { kind: "details" } : null;
      return model.canManageOnChain ? { kind: request.tool } : null;
    case "voucher": {
      if (!model.canManageOnChain) return null;
      const voucher = model.poolVouchers.find(
        (candidate) => candidate.tokenAddress.toLowerCase() === request.address,
      );
      return voucher ? { kind: "voucher", voucher } : null;
    }
    case "activity": {
      if (!model.auth.isAuthenticated) return null;
      const entry = activity.entries.find((candidate) => candidate.key === request.key);
      if (entry) return { kind: "activity", entry };
      const { query } = activity;
      return {
        kind: "activityMissing",
        loading: query.isPending || (query.hasNextPage && !query.isError),
      };
    }
  }
}

/**
 * The pool page as a detail page: the pool in the main column, and whatever
 * the caller docks in the 360px side column (the swap, or its receipt). An
 * owner tool, a voucher's settings or an activity row's details take the side
 * column's place until closed; which one is in the URL (`tool`, `manage`,
 * `entry`), so Back, a refresh and a link keep it.
 *
 * Where the canvas is too narrow to dock the column, `DeskDetail` stacks it.
 * It goes first whenever it is what the person is doing: the swap (the pool's
 * main task, and a long Activity or Holdings table would bury it), a receipt,
 * or a panel they just opened. It stays last when it would only be a dead end,
 * for a guest, who cannot swap, and for a retired pool, which takes no swaps.
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
  const navigation = usePoolSideNavigation();
  const requestedTab = usePoolDeskRequestedTab();
  const pool = model.pool;
  const request = dimmed ? null : navigation.request;
  const activity = usePoolActivityFeed(
    pool,
    model.auth.isAuthenticated && (requestedTab === "activity" || request?.kind === "activity"),
  );
  const panel = resolvePoolSide(request, model, activity);

  // A row named in a link may be on an older page than the one loaded.
  const wantedKey = request?.kind === "activity" ? request.key : null;
  const missing = wantedKey !== null && !activity.entries.some((entry) => entry.key === wantedKey);
  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = activity.query;
  useEffect(() => {
    if (missing && hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage();
  }, [missing, hasNextPage, isFetchingNextPage, isError, fetchNextPage, activity.entries.length]);

  if (model.poolQuery.isPending || model.poolQuery.isError || !pool) {
    return (
      <DeskCanvas className="justify-items-start">
        <p className="text-sm text-muted-foreground">
          {model.poolQuery.isPending
            ? t`Loading pool…`
            : model.poolQuery.isError
              ? t`Couldn't load this pool.`
              : t`Pool not found.`}
        </p>
        {model.poolQuery.isError ? (
          <Button
            variant="outline"
            tap
            pending={model.poolQuery.isFetching}
            onClick={() => void model.poolQuery.refetch()}
          >
            {t`Retry`}
          </Button>
        ) : null}
      </DeskCanvas>
    );
  }
  const close = navigation.close;
  const main = (
    <PoolMain
      model={{ ...model, pool }}
      side={panel}
      onOpenSide={(next) => {
        const target = requestForSide(next);
        if (target) navigation.open(target);
      }}
      activity={activity}
    />
  );
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
      case "activityMissing":
        docked = <PoolActivityMissingSide loading={panel.loading} onClose={close} />;
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
  const sideFirst =
    panel !== null || dimmed || (model.auth.isAuthenticated && pool.active !== false);
  return (
    <DeskDetail
      stacked={sideFirst ? "side-first" : "main-first"}
      main={
        dimmed ? (
          <div inert className="pointer-events-none grid min-w-0 gap-6 opacity-40">
            {main}
          </div>
        ) : (
          main
        )
      }
      side={<div className="w-full min-w-0 max-w-[27.5rem]">{docked}</div>}
    />
  );
}
