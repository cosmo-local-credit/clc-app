import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { POOL_PRICE_INDEX_DECIMALS } from "@clc/core/features/pool-admin/logic";
import { formatTokenAmount, formatTokenAmountFixed } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RiAddLine, RiArrowLeftRightLine, RiSettings3Line } from "react-icons/ri";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { SectionHeading } from "#/components/ui/section-heading";
import {
  type PoolVoucherCatalogState,
  usePoolHoldingGroups,
} from "#/features/pools/hooks/use-pool-holding-groups";
import type { PoolVoucherFeedStatus } from "#/features/pools/hooks/use-pool-quoter";
import type { PoolHolding } from "#/features/pools/logic/pool-holdings";
import { PoolHoldingBar, PoolHoldingIdentity } from "./pool-holding-list";

export function PoolHoldingsPanel({
  pool,
  catalog,
  canManageOnChain,
  onManage,
  onApprove,
}: {
  pool: UserPool;
  catalog: PoolVoucherCatalogState;
  canManageOnChain: boolean;
  onManage: (voucher: PoolVoucher) => void;
  onApprove: (candidate?: string) => void;
}) {
  const { t } = useLingui();
  const state = usePoolHoldingGroups(pool, catalog);
  const canAct = canManageOnChain && pool.active !== false;

  return (
    <div
      id="pool-panel-holdings"
      role="tabpanel"
      aria-labelledby="pool-tab-holdings"
      className="space-y-4"
    >
      {canAct ? (
        <Button variant="outline" tap className="w-full" onClick={() => onApprove()}>
          <RiAddLine className="size-4" aria-hidden="true" />
          <Trans>Approve voucher</Trans>
        </Button>
      ) : null}

      {state.isPending ? (
        <div className="border border-border bg-card p-3 text-muted-foreground text-sm">
          <Trans>Loading holdings…</Trans>
        </div>
      ) : (
        <>
          {state.isError ? (
            <div className="space-y-2 border border-border bg-card p-3">
              <p className="text-muted-foreground text-sm">
                <Trans>Couldn't verify all Pool holdings.</Trans>
              </p>
              <Button variant="outline" tap pending={state.isFetching} onClick={state.refetch}>
                <Trans>Try again</Trans>
              </Button>
            </div>
          ) : null}

          {state.verified ? (
            <>
              <HoldingSection title={<Trans>Accepted vouchers</Trans>} label={t`Accepted vouchers`}>
                {state.accepted.length === 0 ? (
                  <EmptyRow>
                    <Trans>No accepted vouchers in this Pool yet.</Trans>
                  </EmptyRow>
                ) : (
                  state.accepted.map(({ holding, voucher }, index) => (
                    <AcceptedHoldingRow
                      key={holding.tokenAddress}
                      pool={pool}
                      voucher={voucher}
                      holding={holding}
                      unit={state.unit}
                      feed={state.feeds?.get(holding.tokenAddress)}
                      isLast={index === state.accepted.length - 1}
                      canAct={pool.active !== false}
                      canManage={canAct}
                      onManage={() => onManage(voucher)}
                    />
                  ))
                )}
              </HoldingSection>

              <HoldingSection title={<Trans>Pending vouchers</Trans>} label={t`Pending vouchers`}>
                {state.pending.length === 0 ? (
                  <EmptyRow>
                    <Trans>No vouchers are waiting for approval.</Trans>
                  </EmptyRow>
                ) : (
                  state.pending.map((holding, index) => (
                    <PendingHoldingRow
                      key={holding.tokenAddress}
                      holding={holding}
                      unit={state.unit}
                      isLast={index === state.pending.length - 1}
                      canApprove={canAct}
                      onApprove={() => onApprove(holding.tokenAddress)}
                    />
                  ))
                )}
              </HoldingSection>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

function HoldingSection({
  title,
  label,
  children,
}: {
  title: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2" aria-label={label}>
      <SectionHeading as="h2" variant="section">
        {title}
      </SectionHeading>
      <div className="border border-border bg-card">{children}</div>
    </section>
  );
}

function AcceptedHoldingRow({
  pool,
  voucher,
  holding,
  unit,
  feed,
  isLast,
  canAct,
  canManage,
  onManage,
}: {
  pool: UserPool;
  voucher: PoolVoucher;
  holding: PoolHolding;
  unit: string;
  feed?: PoolVoucherFeedStatus;
  isLast: boolean;
  canAct: boolean;
  canManage: boolean;
  onManage: () => void;
}) {
  const { t } = useLingui();
  return (
    <div className={["flex items-center", isLast ? "" : "border-b border-border"].join(" ")}>
      <Link
        to="/vouchers/$voucherAddress"
        params={{ voucherAddress: holding.tokenAddress }}
        search={{ poolAddress: pool.address }}
        className="min-w-0 flex-1 p-3 text-start"
      >
        <div className="flex items-center gap-3">
          <PoolHoldingIdentity
            holding={holding}
            unit={unit}
            feed={feed}
            managerClosure={voucher.managerClosure}
            active={voucher.active}
          />
          <HoldingAmount holding={holding} unit={unit} />
        </div>
        {holding.percentOfLargest === null ? null : (
          <PoolHoldingBar percent={holding.percentOfLargest} fill="bg-info" />
        )}
      </Link>
      {canAct ? (
        <Button asChild tap>
          <Link
            to="/pools/$poolAddress/swap"
            params={{ poolAddress: pool.address }}
            search={{ receive: holding.tokenAddress }}
            aria-label={t`Swap for ${voucher.symbol}`}
          >
            <RiArrowLeftRightLine className="size-3.5" aria-hidden="true" />
            <Trans>Swap</Trans>
          </Link>
        </Button>
      ) : null}
      {canManage ? (
        <button
          type="button"
          aria-label={t`Manage ${voucher.symbol}`}
          onClick={onManage}
          className="flex size-11 shrink-0 items-center justify-center text-muted-foreground"
        >
          <RiSettings3Line className="size-4" aria-hidden="true" />
        </button>
      ) : canAct ? (
        <span className="me-3" />
      ) : null}
    </div>
  );
}

function PendingHoldingRow({
  holding,
  unit,
  isLast,
  canApprove,
  onApprove,
}: {
  holding: PoolHolding;
  unit: string;
  isLast: boolean;
  canApprove: boolean;
  onApprove: () => void;
}) {
  const { t } = useLingui();
  return (
    <div
      className={[
        "flex min-w-0 items-center gap-3 p-3",
        isLast ? "" : "border-b border-border",
      ].join(" ")}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <PoolHoldingIdentity holding={holding} unit={unit} showPricing={false} />
        <div className="shrink-0 text-end">
          <p className="font-mono text-sm font-semibold tabular-nums">
            {holding.decimals === null
              ? "—"
              : `${formatTokenAmount(holding.balanceRaw, holding.decimals, 2)} ${holding.symbol}`}
          </p>
          <Badge variant="muted" size="sm" caps>
            <Trans>Pending approval</Trans>
          </Badge>
        </div>
      </div>
      {canApprove ? (
        <button
          type="button"
          aria-label={t`Approve ${holding.symbol}`}
          onClick={onApprove}
          className="flex size-11 shrink-0 items-center justify-center text-muted-foreground"
        >
          <RiSettings3Line className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function HoldingAmount({ holding, unit }: { holding: PoolHolding; unit: string }) {
  const liquidity =
    holding.decimals === null || holding.liquidityRaw === null
      ? "—"
      : `${formatTokenAmount(holding.liquidityRaw, holding.decimals, 2)} ${holding.symbol}`;

  return (
    <div className="shrink-0 text-end">
      {holding.unitValueRaw === null ? (
        <p className="font-mono text-sm font-semibold tabular-nums">{liquidity}</p>
      ) : (
        <>
          <p className="font-mono text-sm font-semibold tabular-nums">
            {formatTokenAmountFixed(holding.unitValueRaw, POOL_PRICE_INDEX_DECIMALS, 2)} {unit}
          </p>
          <p className="font-mono text-muted-foreground text-2xs tabular-nums">{liquidity}</p>
        </>
      )}
    </div>
  );
}

function EmptyRow({ children }: { children: ReactNode }) {
  return <div className="p-3 text-muted-foreground text-sm">{children}</div>;
}
