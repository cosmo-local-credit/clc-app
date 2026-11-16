import type { CreditFallbackPool } from "@clc/api/features/credit-router/client";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";

import { SectionHeading } from "#/components/ui/section-heading";
import { DeskTable } from "#/desktop/ui/data-table";
import { amountOf, symbolOf, type Labels } from "#/features/credit/logic/credit-display";
import { CreditPoolLink } from "#/features/credit/ui/credit-pool-link";

export function CreditFallbackPoolsDesk({
  pools,
  labels,
  locale,
  targetAddress,
  targetSymbol,
}: {
  pools: CreditFallbackPool[];
  labels: Labels;
  locale: string;
  targetAddress: `0x${string}`;
  targetSymbol: string;
}) {
  const { t } = useLingui();
  return (
    <div className="grid min-w-0 gap-3">
      <p role="status" className="text-sm">
        <Trans>No way to get {targetSymbol} with what you hold</Trans>
      </p>
      {pools.length > 0 ? (
        <>
          <SectionHeading as="h3" variant="group">
            <Trans>Pools that hold {targetSymbol}</Trans>
          </SectionHeading>
          <DeskTable
            label={t`Pools that hold ${targetSymbol}`}
            rows={pools}
            rowKey={(pool) => pool.address}
            renderRow={(_pool, props, cells) => <div {...props}>{cells}</div>}
            columns={[
              {
                id: "pool",
                header: t`Pool`,
                cell: (pool) => (
                  <CreditPoolLink
                    address={pool.address}
                    name={pool.name}
                    className="font-semibold"
                  />
                ),
              },
              {
                id: "accepts",
                header: t`Pay with`,
                cell: (pool) => (
                  <span className="font-mono text-xs">
                    {pool.accepts
                      .slice(0, 4)
                      .map((voucher) => symbolOf(labels, voucher))
                      .join(", ")}
                    {pool.accepts.length > 4 ? ` +${pool.accepts.length - 4}` : ""}
                  </span>
                ),
              },
              {
                id: "liquidity",
                header: t`Liquidity`,
                align: "end",
                cell: (pool) => (
                  <span className="font-mono text-xs font-semibold">
                    {amountOf(labels, targetAddress, pool.liquidity, locale) ?? "—"} {targetSymbol}
                  </span>
                ),
              },
              {
                id: "action",
                header: "",
                width: "4rem",
                align: "end",
                cell: (pool) => (
                  <Link
                    to="/pools/$poolAddress/swap"
                    params={{ poolAddress: pool.address }}
                    search={{ receive: targetAddress }}
                    className="text-primary text-xs font-semibold underline underline-offset-2"
                  >
                    <Trans>Swap</Trans>
                  </Link>
                ),
              },
            ]}
          />
        </>
      ) : null}
    </div>
  );
}
