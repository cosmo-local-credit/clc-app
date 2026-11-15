import { formatFeePpm } from "@clc/core/features/credit-router/logic";
import { Trans, useLingui } from "@lingui/react/macro";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { SectionHeading } from "#/components/ui/section-heading";
import { DeskTable } from "#/desktop/ui/data-table";
import { DeskKV } from "#/desktop/ui/kv";
import type { CreditGet } from "#/features/credit/hooks/use-credit-get";
import {
  amountOf,
  figureOf,
  rateOf,
  symbolOf,
  type Labels,
} from "#/features/credit/logic/credit-display";
import {
  type CreditPayOption,
  creditRouteKey,
  creditRouteShortfall,
  creditRouteVouchers,
} from "#/features/credit/logic/credit-routes";
import { CreditRefusal } from "#/features/credit/ui/credit-failure-notice";

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
  const rawMax = get.mode === "exactOutput" ? route.maxAmountOut : route.maxAmountIn;
  const counted = get.mode === "exactOutput" ? targetAddress : option.voucher;
  const max = rawMax !== null ? amountOf(labels, counted, rawMax, locale) : null;
  const symbol = symbolOf(labels, counted);
  const maxOut =
    route.maxAmountOut !== null
      ? amountOf(labels, targetAddress, route.maxAmountOut, locale)
      : null;
  const outSymbol = symbolOf(labels, targetAddress);
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
          {creditRouteShortfall(route) === "pool" && max !== null && rawMax !== null ? (
            <Button
              variant="outline"
              disabled={BigInt(rawMax) === 0n}
              onClick={() => get.fillMax(option)}
              className="font-mono font-semibold"
            >
              <Trans>
                Max {max} {symbol}
              </Trans>
            </Button>
          ) : null}
        </div>
      ) : null}
      <DeskKV
        labelWidth="100px"
        rows={[
          [<Trans key="label">Rate</Trans>, rateOf(route, "exactInput", labels, locale) ?? "—"],
          [<Trans key="label">Fee</Trans>, formatFeePpm(route.effectiveFeePpm, locale) ?? "—"],
          [
            <Trans key="label">Available</Trans>,
            maxOut ? (
              route.maxIsExact ? (
                <Trans>
                  Up to{" "}
                  <span dir="ltr">
                    {maxOut} {outSymbol}
                  </span>
                </Trans>
              ) : (
                <Trans>
                  At least{" "}
                  <span dir="ltr">
                    {maxOut} {outSymbol}
                  </span>
                </Trans>
              )
            ) : (
              <span className="font-sans font-normal">
                <Trans>Capacity unknown</Trans>
              </span>
            ),
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
              <span title={hop.pool.name} className="font-semibold">
                {hop.pool.name}
              </span>
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
            onSelect={(other) => get.chooseRoute(option.voucher, other)}
            columns={[
              {
                id: "pools",
                header: t`Pool`,
                width: "minmax(0,2fr)",
                cell: (other) => (
                  <span
                    title={other.hops.map((hop) => hop.pool.name).join(" → ")}
                    className="text-xs font-semibold"
                  >
                    {other.hops.map((hop) => hop.pool.name).join(" → ")}
                  </span>
                ),
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
            ]}
          />
        </section>
      ) : null}
    </div>
  );
}
