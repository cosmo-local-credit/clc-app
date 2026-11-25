import { formatFeePpm } from "@clc/core/features/credit-router/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { RiArrowLeftLine, RiCheckLine } from "react-icons/ri";

import { SwapCount } from "#/components/credit/credit-hops";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { SectionHeading } from "#/components/ui/section-heading";
import { Spinner } from "#/components/ui/spinner";
import { Toggle } from "#/components/ui/toggle";
import { WalletAmountInput } from "#/components/wallet";
import { CreditFallbackPoolsDesk } from "#/desktop/credit/fallback-pools";
import { CreditReviewDialog } from "#/desktop/credit/review-dialog";
import { CreditRouteDetailsDesk } from "#/desktop/credit/route-details";
import { DeskTable } from "#/desktop/ui/data-table";
import { DeskCanvas, DeskPanel, DeskTitleRow } from "#/desktop/ui/page";
import type { CreditGet } from "#/features/credit/hooks/use-credit-get";
import { useVoucherLabels } from "#/features/credit/hooks/use-voucher-labels";
import { amountOf, figureOf, symbolOf } from "#/features/credit/logic/credit-display";
import { creditRouteVouchers } from "#/features/credit/logic/credit-routes";
import { CreditFailureNotice } from "#/features/credit/ui/credit-failure-notice";
import { CreditRouteCapacity } from "#/features/credit/ui/credit-route-capacity";
import { cn } from "#/lib/utils";

/** A desktop exchange workspace. The route keeps the transaction state across view changes. */
export function CreditGetDesk({
  voucherAddress,
  get,
}: {
  voucherAddress: `0x${string}`;
  get: CreditGet;
}) {
  const { t, i18n } = useLingui();
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const amountInput = useRef<HTMLInputElement>(null);
  const [inspectedVoucher, setInspectedVoucher] = useState<string | null>(null);
  const labels = useVoucherLabels([
    voucherAddress,
    ...get.options.flatMap((option) =>
      [option.route, ...option.others].flatMap(creditRouteVouchers),
    ),
    ...get.fallbackPools.flatMap((pool) => pool.accepts.slice(0, 4)),
    ...(get.review?.quote.surplus.bridge.map((entry) => entry.voucher) ?? []),
  ]);
  const targetSymbol = get.target?.symbol ?? get.targetLabel?.symbol ?? "";
  const heldAmount = get.heldBalance
    ? amountOf(labels, voucherAddress, get.heldBalance, locale)
    : null;
  const selected = get.options.find(
    (option) => option.voucher.toLowerCase() === get.selectedVoucher,
  );
  const inspected =
    get.options.find((option) => option.voucher === inspectedVoucher) ?? selected ?? get.options[0];
  const empty = !get.routesPending && !get.routesError && get.options.length === 0;

  function inspectOption(option: CreditGet["options"][number]) {
    setInspectedVoucher(option.voucher);
    if (option.state !== "refused") get.selectVoucher(option.voucher);
  }

  return (
    <DeskCanvas>
      <div className="grid gap-3">
        <Link
          to="/vouchers/$voucherAddress"
          params={{ voucherAddress }}
          className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <RiArrowLeftLine className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          <Trans>Voucher</Trans>
        </Link>
        <DeskTitleRow
          title={<Trans>Get {targetSymbol}</Trans>}
          wrap
          actions={
            heldAmount ? (
              <span role="status" className="text-sm text-muted-foreground">
                <Trans>Balance</Trans>{" "}
                <span dir="ltr" className="font-mono font-semibold text-foreground">
                  {heldAmount} {targetSymbol}
                </span>
              </span>
            ) : null
          }
        />
      </div>

      <div className="grid grid-cols-[280px_minmax(0,1fr)] items-start gap-6 @4xl:grid-cols-[320px_minmax(0,1fr)]">
        <DeskPanel className="sticky top-7 grid gap-4">
          <SectionHeading as="h2" variant="section">
            <Trans>Amount</Trans>
          </SectionHeading>
          <div className="flex gap-2" role="group" aria-label={t`Amount`}>
            <Toggle
              variant="outline"
              pressed={get.mode === "exactOutput"}
              onPressedChange={(pressed) => {
                if (pressed) get.setMode("exactOutput");
              }}
              className="flex-1 data-[pressed]:border-primary data-[pressed]:bg-primary data-[pressed]:text-primary-foreground"
            >
              <Trans>Get</Trans>
            </Toggle>
            <Toggle
              variant="outline"
              pressed={get.mode === "exactInput"}
              disabled={get.options.length === 0}
              onPressedChange={(pressed) => {
                if (pressed) get.setMode("exactInput");
              }}
              className="flex-1 data-[pressed]:border-primary data-[pressed]:bg-primary data-[pressed]:text-primary-foreground"
            >
              <Trans>Spend</Trans>
            </Toggle>
          </div>
          <div className="grid gap-2">
            <label htmlFor="desk-credit-amount" className="text-sm font-medium">
              {get.mode === "exactOutput" ? <Trans>You get</Trans> : <Trans>You spend</Trans>}
            </label>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <WalletAmountInput
                ref={amountInput}
                id="desk-credit-amount"
                label={get.mode === "exactOutput" ? t`You get` : t`You spend`}
                value={get.amount}
                highlighted
                onValueChange={get.setAmount}
                aria-describedby={get.amountVoucher ? undefined : "desk-credit-unit"}
              />
              {get.amountVoucher ? (
                <span dir="ltr" className="font-mono text-sm font-semibold">
                  {symbolOf(labels, get.amountVoucher)}
                </span>
              ) : (
                <span
                  id="desk-credit-unit"
                  className="max-w-24 text-xs leading-tight text-muted-foreground"
                >
                  <Trans>of the voucher you pay with</Trans>
                </span>
              )}
            </div>
            {selected ? (
              <div className="flex justify-end">
                <CreditRouteCapacity
                  route={selected.route}
                  mode={get.mode}
                  inputVoucher={selected.voucher}
                  outputVoucher={voucherAddress}
                  labels={labels}
                  locale={locale}
                  onMax={() => get.fillRouteMax(selected.voucher, selected.route)}
                  compact
                />
              </div>
            ) : null}
          </div>
          <dl className="grid gap-3 border-border border-t pt-4 text-xs">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">
                <Trans>Pay with</Trans>
              </dt>
              <dd dir="ltr" className="font-mono font-semibold">
                {selected ? symbolOf(labels, selected.voucher) : "—"}
              </dd>
            </div>
            {selected ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">
                    <Trans>Estimate</Trans>
                  </dt>
                  <dd dir="ltr" className="min-w-0 break-words text-end font-mono font-semibold">
                    {selected.state === "pending" ? (
                      <Spinner />
                    ) : (
                      (figureOf(
                        selected.route,
                        selected.state === "carries",
                        get.mode,
                        labels,
                        locale,
                      ) ?? "—")
                    )}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">
                    <Trans>Fee</Trans>
                  </dt>
                  <dd className="font-mono font-semibold">
                    {formatFeePpm(selected.route.effectiveFeePpm, locale) ?? "—"}
                  </dd>
                </div>
              </>
            ) : null}
          </dl>
          {get.problem ? (
            <p role="alert" className="text-xs text-destructive">
              {get.problem}
            </p>
          ) : null}
          {get.quoteError && !get.review ? (
            <CreditFailureNotice
              error={get.quoteError}
              onRetry={() => void get.requestQuote()}
              onEdit={() => amountInput.current?.focus()}
            />
          ) : null}
          <Button
            disabled={!get.canQuote}
            pending={get.quoting}
            onClick={() => void get.requestQuote()}
            className="w-full"
          >
            <Trans>Review</Trans>
          </Button>
        </DeskPanel>

        <div className="grid min-w-0 gap-6">
          <section className="grid min-w-0 gap-3">
            <div className="flex items-center justify-between gap-3">
              <SectionHeading as="h2" variant="section">
                <Trans>Pay with</Trans>
              </SectionHeading>
              <Badge size="sm" variant="outline">
                <Trans>Estimate</Trans>
              </Badge>
            </div>
            {get.stale ? (
              <p role="status" className="text-xs text-muted-foreground">
                <Trans>Options may be out of date.</Trans>
              </p>
            ) : null}
            {get.routesPending ? (
              <DeskPanel>
                <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner />
                  <Trans>Finding options…</Trans>
                </p>
              </DeskPanel>
            ) : null}
            {get.routesError ? (
              <CreditFailureNotice
                error={get.routesError}
                onRetry={get.retryRoutes}
                retrying={get.routesFetching}
              />
            ) : null}
            {get.options.length > 0 ? (
              <DeskTable
                label={t`Pay with`}
                rows={get.options}
                rowKey={(option) => option.voucher.toLowerCase()}
                selectedKey={get.selectedVoucher}
                renderRow={(_option, { className, style }, cells) => (
                  <div className={cn("relative isolate", className)} style={style}>
                    {cells}
                  </div>
                )}
                columns={[
                  {
                    id: "voucher",
                    header: t`Voucher`,
                    cell: (option) => (
                      <button
                        type="button"
                        data-desktop-row=""
                        aria-pressed={option.voucher.toLowerCase() === get.selectedVoucher}
                        onFocus={() => inspectOption(option)}
                        onClick={() => inspectOption(option)}
                        className="inline-flex items-center gap-1.5 font-mono font-semibold after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-primary"
                      >
                        {option.voucher.toLowerCase() === get.selectedVoucher ? (
                          <RiCheckLine
                            className="size-3.5 shrink-0 text-primary"
                            aria-hidden="true"
                          />
                        ) : null}
                        {symbolOf(labels, option.voucher)}
                      </button>
                    ),
                  },
                  {
                    id: "balance",
                    header: t`Balance`,
                    align: "end",
                    cell: (option) => (
                      <span className="font-mono font-semibold">
                        {amountOf(labels, option.voucher, option.walletBalance, locale) ?? "—"}
                      </span>
                    ),
                  },
                  {
                    id: "estimate",
                    header: t`Estimate`,
                    width: "minmax(0,1.8fr)",
                    align: "end",
                    cell: (option) =>
                      option.state === "refused" ? (
                        <span className="text-xs text-destructive">
                          <Trans>Not available for this amount</Trans>
                        </span>
                      ) : option.state === "pending" ? (
                        <Spinner />
                      ) : (
                        <span className="font-mono text-xs font-semibold">
                          {figureOf(
                            option.route,
                            option.state === "carries",
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
                    cell: (option) => (
                      // Keep only the Max button above the route selector's row-wide hit area.
                      <span className="pointer-events-none relative z-10 [&>button]:pointer-events-auto">
                        <CreditRouteCapacity
                          route={option.route}
                          mode={get.mode}
                          inputVoucher={option.voucher}
                          outputVoucher={voucherAddress}
                          labels={labels}
                          locale={locale}
                          onMax={() => {
                            setInspectedVoucher(option.voucher);
                            get.fillRouteMax(option.voucher, option.route);
                          }}
                          compact
                        />
                      </span>
                    ),
                  },
                  {
                    id: "swaps",
                    header: t`Swaps`,
                    width: "4.5rem",
                    align: "end",
                    cell: (option) => <span className="font-mono">{option.route.hops.length}</span>,
                  },
                ]}
              />
            ) : null}
            {get.hasMoreRoutes ? (
              <Button
                variant="outline"
                pending={get.loadingMoreRoutes}
                onClick={get.loadMoreRoutes}
                className="justify-self-start"
              >
                <Trans>Load more</Trans>
              </Button>
            ) : null}
            {empty ? (
              <CreditFallbackPoolsDesk
                pools={get.fallbackPools}
                labels={labels}
                locale={locale}
                targetAddress={voucherAddress}
                targetSymbol={targetSymbol}
              />
            ) : null}
          </section>
          {inspected ? (
            <section className="grid min-w-0 gap-3">
              <div className="flex items-center justify-between gap-3">
                <SectionHeading as="h2" variant="section">
                  <Trans>Route details</Trans>
                </SectionHeading>
                <span className="text-xs text-muted-foreground">
                  <SwapCount hops={inspected.route.hops.length} />
                </span>
              </div>
              <CreditRouteDetailsDesk
                option={inspected}
                get={get}
                labels={labels}
                locale={locale}
                targetAddress={voucherAddress}
              />
            </section>
          ) : null}
        </div>
      </div>
      <CreditReviewDialog get={get} labels={labels} locale={locale} />
    </DeskCanvas>
  );
}
