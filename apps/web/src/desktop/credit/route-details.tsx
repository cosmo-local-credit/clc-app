import { formatFeePpm } from "@clc/core/features/credit-router/logic";
import { Trans, useLingui } from "@lingui/react/macro";

import { Badge } from "#/components/ui/badge";
import { SectionHeading } from "#/components/ui/section-heading";
import { DeskTable } from "#/desktop/ui/data-table";
import { DeskKV } from "#/desktop/ui/kv";
import type { CreditGet } from "#/features/credit/hooks/use-credit-get";
import { figureOf, rateOf, symbolOf, type Labels } from "#/features/credit/logic/credit-display";
import {
  type CreditPayOption,
  creditRouteKey,
  creditRouteVouchers,
} from "#/features/credit/logic/credit-routes";
import { CreditRefusal } from "#/features/credit/ui/credit-failure-notice";
import { CreditPoolLink, CreditPoolLinks } from "#/features/credit/ui/credit-pool-link";
import { CreditRouteCapacity } from "#/features/credit/ui/credit-route-capacity";
import { cn } from "#/lib/utils";

export function CreditRouteDetailsDesk({
  option,
  get,
  labels,
  locale,
  targetAddress,
}: {
  option: CreditPayOption;
  get: CreditGet;
  labels: Labels;
  locale: string;
  targetAddress: `0x${string}`;
}) {
  const { t } = useLingui();
  const { route } = option;
  const vouchers = creditRouteVouchers(route);

  return (
    <div className="grid min-w-0 gap-3">
      <p dir="ltr" className="break-words font-mono text-sm font-semibold">
        {vouchers.map((voucher) => symbolOf(labels, voucher)).join(" → ")}
      </p>
      {option.state === "refused" ? (
        <div
          className="flex items-center justify-between gap-3 border border-destructive bg-card p-3"
          role="alert"
        >
          <span className="text-sm">
            <CreditRefusal reason={route.refusal?.reason ?? route.limitedBy ?? ""} />
          </span>
          <CreditRouteCapacity
            route={route}
            mode={get.mode}
            inputVoucher={option.voucher}
            outputVoucher={targetAddress}
            labels={labels}
            locale={locale}
            onMax={() => get.fillRouteMax(option.voucher, route)}
            compact
          />
        </div>
      ) : null}
      <DeskKV
        labelWidth="100px"
        rows={[
          [<Trans key="label">Rate</Trans>, rateOf(route, "exactInput", labels, locale) ?? "—"],
          [<Trans key="label">Fee</Trans>, formatFeePpm(route.effectiveFeePpm, locale) ?? "—"],
          [
            <Trans key="label">Available</Trans>,
            <CreditRouteCapacity
              key="capacity"
              route={route}
              mode={get.mode}
              inputVoucher={option.voucher}
              outputVoucher={targetAddress}
              labels={labels}
              locale={locale}
            />,
          ],
        ]}
      />
      <DeskTable
        label={t`Route details`}
        rows={route.hops}
        rowKey={(hop) => `${hop.pool.address}-${hop.tokenIn}-${hop.tokenOut}`}
        renderRow={(_hop, props, cells) => <div {...props}>{cells}</div>}
        columns={[
          {
            id: "pool",
            header: t`Pool`,
            width: "minmax(0,1.5fr)",
            cell: (hop) => (
              <CreditPoolLink
                address={hop.pool.address}
                name={hop.pool.name}
                className="font-semibold"
              />
            ),
          },
          {
            id: "swap",
            header: t`Swap`,
            width: "minmax(0,1.5fr)",
            cell: (hop) => (
              <span dir="ltr" className="font-mono text-xs">
                {symbolOf(labels, hop.tokenIn)} → {symbolOf(labels, hop.tokenOut)}
              </span>
            ),
          },
          {
            id: "pool-fee",
            header: t`Pool fee`,
            width: "6rem",
            align: "end",
            cell: (hop) => (
              <span className="font-mono text-xs font-semibold">
                {formatFeePpm(hop.feePpm, locale) ?? "—"}
                {hop.feeSource === "default" ? (
                  <span className="sr-only">
                    {" "}
                    · <Trans>Fee not confirmed</Trans>
                  </span>
                ) : null}
              </span>
            ),
          },
          {
            id: "protocol-fee",
            header: t`Protocol fee`,
            width: "8rem",
            align: "end",
            cell: (hop) => (
              <span className="font-mono text-xs font-semibold">
                {formatFeePpm(hop.protocolFeePpm, locale) ?? "—"}
              </span>
            ),
          },
        ]}
      />
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge size="sm" variant="outline">
          <Trans>Estimate</Trans>
        </Badge>
        {route.hops.some((hop) => hop.feeSource === "default") ? (
          <Badge size="sm" variant="outline">
            <Trans>Fee not confirmed</Trans>
          </Badge>
        ) : null}
        {get.asOfBlock !== undefined ? (
          <span>
            <Trans>
              Estimated at block{" "}
              <span dir="ltr" className="font-mono font-semibold">
                {get.asOfBlock}
              </span>
            </Trans>
          </span>
        ) : null}
      </div>
      {option.others.length > 0 ? (
        <section className="mt-1 grid min-w-0 gap-2">
          <SectionHeading as="h3" variant="group">
            <Trans>Other ways</Trans>
          </SectionHeading>
          <DeskTable
            label={t`Other ways`}
            rows={option.others}
            rowKey={creditRouteKey}
            renderRow={(_other, { className, style }, cells) => (
              <div className={cn("relative isolate", className)} style={style}>
                {cells}
              </div>
            )}
            columns={[
              {
                id: "pools",
                header: t`Pool`,
                width: "minmax(0,2fr)",
                cell: (other) => {
                  const pools = other.hops.map((hop) => hop.pool);
                  // Choosing an alternate moves it out of this table. Keep its actions reachable by Tab.
                  return (
                    <>
                      <button
                        type="button"
                        data-desktop-row=""
                        aria-label={pools.map((pool) => pool.name).join(" → ")}
                        onClick={() => get.chooseRoute(option.voucher, other)}
                        className="absolute inset-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                      />
                      <CreditPoolLinks
                        pools={pools}
                        className="pointer-events-none relative z-10 text-xs font-semibold [&_a]:pointer-events-auto"
                      />
                    </>
                  );
                },
              },
              {
                id: "swaps",
                header: t`Swaps`,
                width: "4.5rem",
                align: "end",
                cell: (other) => <span className="font-mono">{other.hops.length}</span>,
              },
              {
                id: "figure",
                header: t`Estimate`,
                width: "minmax(0,1.5fr)",
                align: "end",
                cell: (other) =>
                  (option.state === "carries" || option.state === "refused") &&
                  other.carriesAmount === false ? (
                    <span className="text-xs text-destructive">
                      <CreditRefusal reason={other.refusal?.reason ?? other.limitedBy ?? ""} />
                    </span>
                  ) : (
                    <span className="font-mono text-xs font-semibold">
                      {figureOf(
                        other,
                        option.state === "carries" || option.state === "refused",
                        get.mode,
                        labels,
                        locale,
                      ) ?? "—"}
                    </span>
                  ),
              },
              {
                id: "max",
                header: t`Max`,
                width: "minmax(8rem,1.2fr)",
                align: "end",
                cell: (other) => (
                  <span className="pointer-events-none relative z-10 [&>button]:pointer-events-auto">
                    <CreditRouteCapacity
                      route={other}
                      mode={get.mode}
                      inputVoucher={option.voucher}
                      outputVoucher={targetAddress}
                      labels={labels}
                      locale={locale}
                      onMax={() => get.fillRouteMax(option.voucher, other)}
                      compact
                    />
                  </span>
                ),
              },
            ]}
          />
        </section>
      ) : null}
    </div>
  );
}
