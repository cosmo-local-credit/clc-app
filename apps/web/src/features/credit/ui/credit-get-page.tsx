import type {
  CreditFallbackPool,
  CreditQuote,
  CreditRoute,
} from "@clc/api/features/credit-router/client";
import { formatCreditRate, formatFeePpm } from "@clc/core/features/credit-router/logic";
import { formatTokenAmountFixed } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useId, useRef, useState } from "react";
import { RiArrowDownSLine, RiCheckLine } from "react-icons/ri";

import { SwapCount } from "#/components/credit/credit-hops";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { RadioGroup, RadioGroupItem } from "#/components/ui/radio-group";
import { SectionHeading } from "#/components/ui/section-heading";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { Spinner } from "#/components/ui/spinner";
import { Toggle } from "#/components/ui/toggle";
import { WalletAmountInput } from "#/components/wallet";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { CreditQuoteRefusedError } from "#/features/credit/api/relay-credit-quote";
import { type CreditGet, useCreditGet } from "#/features/credit/hooks/use-credit-get";
import { type VoucherLabel, useVoucherLabels } from "#/features/credit/hooks/use-voucher-labels";
import {
  type CreditPayOption,
  creditRouteKey,
  creditRouteShortfall,
  creditRouteVouchers,
} from "#/features/credit/logic/credit-routes";
import { formatPoolSwapFee } from "#/features/pools/logic/pool-swap-fees";
import { cn } from "#/lib/utils";
import { CreditFailureNotice, CreditRefusal } from "./credit-failure-notice";

type Labels = Map<string, VoucherLabel>;

function symbolOf(labels: Labels, address: string): string {
  return labels.get(address.toLowerCase())?.symbol ?? `${address.slice(0, 6)}…`;
}

function amountOf(labels: Labels, address: string, raw: string, locale: string): string | null {
  const decimals = labels.get(address.toLowerCase())?.decimals;
  if (decimals === null || decimals === undefined) return null;
  return formatTokenAmountFixed(raw, decimals, 2, locale);
}

/**
 * "1 CCC ≈ 1.02 AAA" when getting, "1 AAA ≈ 0.98 CCC" when spending: one
 * whole unit of the voucher the amount is counted in. Null when the rate or
 * a voucher's decimals is unknown.
 */
function rateOf(
  route: CreditRoute,
  mode: CreditGet["mode"],
  labels: Labels,
  locale: string,
): string | null {
  const vouchers = creditRouteVouchers(route);
  const input = vouchers[0]!;
  const output = vouchers.at(-1)!;
  const decimalsIn = labels.get(input.toLowerCase())?.decimals;
  const decimalsOut = labels.get(output.toLowerCase())?.decimals;
  if (!route.rate || decimalsIn == null || decimalsOut == null) return null;
  const [from, to] = mode === "exactOutput" ? [output, input] : [input, output];
  const rate =
    mode === "exactOutput"
      ? formatCreditRate({
          amountIn: route.rate.amountOut,
          amountOut: route.rate.amountIn,
          decimalsIn: decimalsOut,
          decimalsOut: decimalsIn,
          locale,
        })
      : formatCreditRate({
          amountIn: route.rate.amountIn,
          amountOut: route.rate.amountOut,
          decimalsIn,
          decimalsOut,
          locale,
        });
  if (!rate) return null;
  const one = formatTokenAmountFixed("1", 0, 0, locale);
  return `${one} ${symbolOf(labels, from)} ≈ ${rate} ${symbolOf(labels, to)}`;
}

/**
 * What a route costs at the entered amount when getting, or what it pays out
 * when spending, as an estimate; the rate before an amount is priced.
 */
function figureOf(
  route: CreditRoute,
  priced: boolean,
  mode: CreditGet["mode"],
  labels: Labels,
  locale: string,
): string | null {
  const vouchers = creditRouteVouchers(route);
  const counted =
    mode === "exactOutput"
      ? { voucher: vouchers[0]!, raw: route.amountIn }
      : { voucher: vouchers.at(-1)!, raw: route.amountOut };
  const amount =
    priced && counted.raw ? amountOf(labels, counted.voucher, counted.raw, locale) : null;
  if (amount) return `≈ ${amount} ${symbolOf(labels, counted.voucher)}`;
  return rateOf(route, mode, labels, locale);
}

/**
 * Get a voucher with the vouchers the wallet already holds, through as many
 * pools as the router routes. The screen leads with the amount and the
 * voucher to pay with; each voucher's swaps, pools and fees open on demand.
 * Routes come from the server's discovery (estimates); the exchange is
 * priced by an authoritative quote, checked against the request and the
 * review, and signed by the app over its own digest.
 */
export function CreditGetPage({ voucherAddress }: { voucherAddress: `0x${string}` }) {
  const { t, i18n } = useLingui();
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const get = useCreditGet(voucherAddress);
  const amountInput = useRef<HTMLInputElement>(null);
  const payWithId = useId();
  const routeVouchers = get.options.flatMap((option) =>
    [option.route, ...option.others].flatMap((route) => creditRouteVouchers(route)),
  );
  const fallbackVouchers = get.fallbackPools.flatMap((pool) => pool.accepts.slice(0, 4));
  const labels = useVoucherLabels([voucherAddress, ...routeVouchers, ...fallbackVouchers]);
  const targetSymbol = get.target?.symbol ?? get.targetLabel?.symbol ?? "";
  const amountSymbol = get.amountVoucher ? symbolOf(labels, get.amountVoucher) : "";
  const heldAmount = get.heldBalance
    ? amountOf(labels, voucherAddress, get.heldBalance, locale)
    : null;
  const noRoutes = !get.routesPending && !get.routesError && get.options.length === 0;
  const rowProps = {
    get,
    labels,
    locale,
    target: voucherAddress,
  };

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-bottom-nav">
      <BackChevron label={t`Voucher`} to={`/vouchers/${voucherAddress}`} />
      <h1 className="font-heading mb-3.5 text-[1.75rem] font-bold leading-tight">
        <Trans>Get {targetSymbol}</Trans>
      </h1>

      {heldAmount ? (
        <p role="status" className="mb-3 border border-border bg-card p-3 text-sm">
          <Trans>
            You already have{" "}
            <span dir="ltr" className="font-mono font-semibold">
              {heldAmount} {targetSymbol}
            </span>
          </Trans>
        </p>
      ) : null}

      <div className="flex gap-2" role="group" aria-label={t`Amount`}>
        <Toggle
          variant="outline"
          pressed={get.mode === "exactOutput"}
          onPressedChange={() => get.setMode("exactOutput")}
        >
          <Trans>Get</Trans>
        </Toggle>
        <Toggle
          variant="outline"
          pressed={get.mode === "exactInput"}
          onPressedChange={() => get.setMode("exactInput")}
          disabled={get.options.length === 0}
        >
          <Trans>Spend</Trans>
        </Toggle>
      </div>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <WalletAmountInput
          ref={amountInput}
          id="credit-amount"
          label={get.mode === "exactOutput" ? t`You get` : t`You spend`}
          highlighted
          value={get.amount}
          onValueChange={get.setAmount}
        />
        <span dir="ltr" className="font-mono text-sm font-semibold">
          {amountSymbol}
        </span>
      </div>
      {get.stale ? (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          <Trans>Options may be out of date.</Trans>
        </p>
      ) : null}

      <div className="mt-5 space-y-3">
        {get.routesPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Spinner />
            <Trans>Finding options…</Trans>
          </p>
        ) : null}
        {get.routesError ? (
          <CreditFailureNotice
            error={get.routesError}
            onRetry={get.retryRoutes}
            retrying={get.routesFetching}
          />
        ) : null}
        {get.options.length > 0 ? (
          <section className="space-y-2">
            <SectionHeading variant="section" as="h2" id={payWithId}>
              <Trans>Pay with</Trans>
            </SectionHeading>
            {get.options.length === 1 ? (
              <div className="border border-border bg-card">
                <CreditPayRow option={get.options[0]!} radio={false} {...rowProps} />
              </div>
            ) : (
              <RadioGroup
                aria-labelledby={payWithId}
                value={get.selectedVoucher}
                onValueChange={(voucher) => {
                  if (typeof voucher === "string") get.selectVoucher(voucher);
                }}
                className="gap-0 border border-border bg-card"
              >
                {get.options.map((option) => (
                  <CreditPayRow key={option.voucher} option={option} radio {...rowProps} />
                ))}
              </RadioGroup>
            )}
          </section>
        ) : null}
        {get.hasMoreRoutes ? (
          <Button
            variant="outline"
            tap
            className="w-full"
            pending={get.loadingMoreRoutes}
            onClick={get.loadMoreRoutes}
          >
            <Trans>Load more</Trans>
          </Button>
        ) : null}
        {noRoutes ? (
          <CreditFallbackPools
            pools={get.fallbackPools}
            labels={labels}
            locale={locale}
            targetAddress={voucherAddress}
            targetSymbol={targetSymbol}
          />
        ) : null}
      </div>

      <div className="flex-1" />
      {get.problem ? (
        <p role="alert" className="mt-3 text-xs text-destructive">
          {get.problem}
        </p>
      ) : null}
      {get.quoteError && !get.review ? (
        <div className="mt-3">
          <CreditFailureNotice
            error={get.quoteError}
            onRetry={() => void get.requestQuote()}
            onEdit={() => amountInput.current?.focus()}
          />
        </div>
      ) : null}
      <Button
        tap
        className="mt-3 w-full"
        disabled={!get.canQuote}
        pending={get.quoting}
        onClick={() => void get.requestQuote()}
      >
        <Trans>Review</Trans>
      </Button>

      <CreditReviewSheet get={get} labels={labels} locale={locale} />
    </div>
  );
}

type RowProps = {
  get: CreditGet;
  labels: Labels;
  locale: string;
  target: `0x${string}`;
};

/**
 * One voucher to pay with: its symbol, how many swaps its route takes, and the
 * one figure that varies with the mode. A route that cannot take the amount
 * says why on the row, and offers the most it takes when a pool is the limit.
 * The swaps, pools, fees and the voucher's other routes open beneath it.
 */
function CreditPayRow({
  option,
  radio,
  get,
  labels,
  locale,
  target,
}: RowProps & { option: CreditPayOption; radio: boolean }) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const symbolId = useId();
  const figure =
    option.state === "refused"
      ? null
      : figureOf(option.route, option.state === "carries", get.mode, labels, locale);
  const line = (
    <>
      <span id={symbolId} className="min-w-0 flex-1 truncate text-sm font-semibold">
        <bdi dir="ltr">{symbolOf(labels, option.voucher)}</bdi>
      </span>
      {figure ? (
        <span dir="ltr" className="shrink-0 font-mono text-xs font-semibold">
          {figure}
        </span>
      ) : null}
    </>
  );

  return (
    <div className="border-b border-border last:border-b-0">
      {radio ? (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 pt-2 has-[[data-disabled]]:cursor-default">
          {line}
          <RadioGroupItem
            value={option.voucher.toLowerCase()}
            disabled={option.state === "refused"}
            className="data-[disabled]:opacity-50"
          />
        </label>
      ) : (
        <div className="flex min-h-11 items-center gap-3 px-3 pt-2">
          {line}
          {get.selectedVoucher === option.voucher.toLowerCase() ? (
            <RiCheckLine className="size-4 shrink-0 text-primary" aria-hidden="true" />
          ) : null}
        </div>
      )}
      <div className="flex min-h-8 items-center justify-between gap-3 px-3 pb-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailsId}
          aria-describedby={symbolId}
          onClick={() => setOpen((current) => !current)}
          className="-mx-1 inline-flex min-h-8 items-center gap-1 px-1 text-xs text-muted-foreground"
        >
          <SwapCount hops={option.route.hops.length} />
          <RiArrowDownSLine
            className={cn("size-4 transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
        </button>
        {option.state === "refused" ? (
          <CreditShortfall
            route={option.route}
            voucher={option.voucher}
            onMax={() => get.fillMax(option)}
            mode={get.mode}
            labels={labels}
            locale={locale}
            target={target}
          />
        ) : null}
      </div>
      {open ? (
        <div id={detailsId} className="space-y-3 border-t border-border px-3 py-3">
          <CreditRouteDetails
            route={option.route}
            asOfBlock={get.asOfBlock}
            labels={labels}
            locale={locale}
          />
          {option.others.length > 0 ? (
            <section className="space-y-1">
              <SectionHeading variant="group" as="h3">
                <Trans>Other ways</Trans>
              </SectionHeading>
              {option.others.map((route) => (
                <CreditOtherWay
                  key={creditRouteKey(route)}
                  route={route}
                  priced={option.state === "carries" || option.state === "refused"}
                  onChoose={() => get.chooseRoute(option.voucher, route)}
                  mode={get.mode}
                  labels={labels}
                  locale={locale}
                  target={target}
                />
              ))}
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Why a route does not take the entered amount: more than the wallet holds,
 * or a pool's stock or credit limit, which offers the most it takes.
 */
function CreditShortfall({
  route,
  voucher,
  onMax,
  mode,
  labels,
  locale,
  target,
}: {
  route: CreditRoute;
  voucher: `0x${string}`;
  /** Absent where the shortfall is only read, as inside another control. */
  onMax?: () => void;
  mode: CreditGet["mode"];
  labels: Labels;
  locale: string;
  target: `0x${string}`;
}) {
  const shortfall = creditRouteShortfall(route);
  if (shortfall === "wallet") {
    return (
      <span className="text-xs text-destructive">
        <Trans>More than you have</Trans>
      </span>
    );
  }
  // The most the route takes, in the voucher the amount is counted in.
  const raw = mode === "exactOutput" ? route.maxAmountOut : route.maxAmountIn;
  const counted = mode === "exactOutput" ? target : voucher;
  const max = shortfall === "pool" && raw !== null ? amountOf(labels, counted, raw, locale) : null;
  if (raw === null || max === null) {
    return (
      <span className="text-xs text-destructive">
        <CreditRefusal reason={route.refusal?.reason ?? route.limitedBy ?? ""} />
      </span>
    );
  }
  const symbol = symbolOf(labels, counted);
  if (!onMax) {
    return (
      <span dir="ltr" className="font-mono text-xs font-semibold text-destructive">
        <Trans>
          Max {max} {symbol}
        </Trans>
      </span>
    );
  }
  return (
    <Button
      variant="outline"
      tap
      disabled={BigInt(raw) === 0n}
      onClick={onMax}
      className="font-mono font-semibold"
    >
      <Trans>
        Max {max} {symbol}
      </Trans>
    </Button>
  );
}

/**
 * A route's swaps in order, each with its pool and fees, and the route's
 * rate, capacity and fee, all as estimates.
 */
function CreditRouteDetails({
  route,
  asOfBlock,
  labels,
  locale,
}: {
  route: CreditRoute;
  asOfBlock: number | undefined;
  labels: Labels;
  locale: string;
}) {
  const vouchers = creditRouteVouchers(route);
  const output = vouchers.at(-1)!;
  const bridgeSymbols = vouchers.slice(1, -1).map((voucher) => symbolOf(labels, voucher));
  const bridges = new Intl.ListFormat(locale, { type: "unit", style: "short" }).format(
    bridgeSymbols,
  );
  const rate = rateOf(route, "exactInput", labels, locale);
  const fee = formatFeePpm(route.effectiveFeePpm, locale);
  const maxOut = route.maxAmountOut ? amountOf(labels, output, route.maxAmountOut, locale) : null;
  const outSymbol = symbolOf(labels, output);

  return (
    <>
      {bridgeSymbols.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          <Trans>via {bridges}</Trans>
        </p>
      ) : null}
      <dl className="space-y-1 text-xs">
        {rate ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">
              <Trans>Rate</Trans>
            </dt>
            <dd dir="ltr" className="font-mono font-semibold">
              {rate}
            </dd>
          </div>
        ) : null}
        {fee ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">
              <Trans>Fee</Trans>
            </dt>
            <dd className="font-mono font-semibold">{fee}</dd>
          </div>
        ) : null}
      </dl>
      <p className="text-xs text-muted-foreground">
        {maxOut ? (
          route.maxIsExact ? (
            <Trans>
              Up to{" "}
              <span dir="ltr" className="font-mono font-semibold text-foreground">
                {maxOut} {outSymbol}
              </span>
            </Trans>
          ) : (
            <Trans>
              At least{" "}
              <span dir="ltr" className="font-mono font-semibold text-foreground">
                {maxOut} {outSymbol}
              </span>
            </Trans>
          )
        ) : (
          <Trans>Capacity unknown</Trans>
        )}
      </p>
      <ol className="space-y-2">
        {route.hops.map((hop, index) => {
          const position = formatTokenAmountFixed(String(index + 1), 0, 0, locale);
          const path = `${symbolOf(labels, hop.tokenIn)} → ${symbolOf(labels, hop.tokenOut)}`;
          const poolName = hop.pool.name;
          return (
            <li key={`${hop.pool.address}-${index}`} className="space-y-0.5">
              <p className="text-xs font-semibold">
                <Trans>
                  Swap {position}: <span dir="ltr">{path}</span> · {poolName}
                </Trans>
              </p>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>
                  <Trans>Pool fee</Trans>{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {formatFeePpm(hop.feePpm, locale) ?? "—"}
                  </span>
                </span>
                <span>
                  <Trans>Protocol fee</Trans>{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {formatFeePpm(hop.protocolFeePpm, locale) ?? "—"}
                  </span>
                </span>
                {hop.feeSource === "default" ? (
                  <Badge size="sm" variant="outline">
                    <Trans>Fee not confirmed</Trans>
                  </Badge>
                ) : null}
              </p>
            </li>
          );
        })}
      </ol>
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge size="sm" variant="outline">
          <Trans>Estimate</Trans>
        </Badge>
        {asOfBlock !== undefined ? (
          <span>
            <Trans>
              Estimated at block{" "}
              <span dir="ltr" className="font-mono font-semibold">
                {asOfBlock}
              </span>
            </Trans>
          </span>
        ) : null}
      </p>
    </>
  );
}

/** Another route for the same voucher; choosing it makes it the voucher's route. */
function CreditOtherWay({
  route,
  priced,
  onChoose,
  mode,
  labels,
  locale,
  target,
}: {
  route: CreditRoute;
  priced: boolean;
  onChoose: () => void;
  mode: CreditGet["mode"];
  labels: Labels;
  locale: string;
  target: `0x${string}`;
}) {
  const vouchers = creditRouteVouchers(route);
  const bridgeSymbols = vouchers.slice(1, -1).map((voucher) => symbolOf(labels, voucher));
  const bridges = new Intl.ListFormat(locale, { type: "unit", style: "short" }).format(
    bridgeSymbols,
  );
  const pools = new Intl.ListFormat(locale, { type: "unit", style: "short" }).format(
    route.hops.map((hop) => hop.pool.name),
  );
  const refused = priced && route.carriesAmount === false;
  const figure = refused ? null : figureOf(route, priced, mode, labels, locale);

  return (
    <button
      type="button"
      onClick={onChoose}
      className="flex min-h-11 w-full items-center gap-3 border-t border-border py-2 text-start active:bg-muted"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold">
          <SwapCount hops={route.hops.length} />
          {bridgeSymbols.length > 0 ? (
            <>
              {" · "}
              <Trans>via {bridges}</Trans>
            </>
          ) : null}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{pools}</span>
      </span>
      {refused ? (
        <CreditShortfall
          route={route}
          voucher={vouchers[0]!}
          mode={mode}
          labels={labels}
          locale={locale}
          target={target}
        />
      ) : figure ? (
        <span dir="ltr" className="shrink-0 font-mono text-xs font-semibold">
          {figure}
        </span>
      ) : null}
    </button>
  );
}

function CreditFallbackPools({
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
  return (
    <section className="space-y-2">
      <p role="status" className="text-sm">
        <Trans>No way to get {targetSymbol} with what you hold</Trans>
      </p>
      {pools.length > 0 ? (
        <>
          <SectionHeading variant="section" as="h2">
            <Trans>Pools that hold {targetSymbol}</Trans>
          </SectionHeading>
          <div className="border border-border bg-card">
            {pools.map((pool, index) => {
              const shown = pool.accepts.slice(0, 4).map((voucher) => symbolOf(labels, voucher));
              const more = pool.accepts.length - shown.length;
              return (
                <Link
                  key={pool.address}
                  to="/pools/$poolAddress/swap"
                  params={{ poolAddress: pool.address }}
                  search={{ receive: targetAddress }}
                  className={cn(
                    "flex items-center justify-between gap-3 px-3 py-2.5",
                    index > 0 && "border-t border-border",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{pool.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      <Trans>
                        Takes{" "}
                        <span dir="ltr" className="font-mono">
                          {shown.join(", ")}
                          {more > 0 ? ` +${more}` : ""}
                        </span>
                      </Trans>
                    </span>
                  </span>
                  <span dir="ltr" className="shrink-0 font-mono text-xs font-semibold">
                    {amountOf(labels, targetAddress, pool.liquidity, locale) ?? "—"} {targetSymbol}
                  </span>
                </Link>
              );
            })}
          </div>
        </>
      ) : null}
    </section>
  );
}

function CreditReviewSheet({
  get,
  labels,
  locale,
}: {
  get: CreditGet;
  labels: Labels;
  locale: string;
}) {
  const quote = get.review?.quote;
  return (
    <SheetRoot
      open={!!get.review}
      onOpenChange={(open) => {
        if (!open) get.closeReview();
      }}
    >
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="[&>div:first-child]:hidden">
          <SheetHeader className="px-6 pt-5 pb-3">
            <SheetTitle>
              <Trans>Confirm exchange</Trans>
            </SheetTitle>
          </SheetHeader>
          {quote && get.review ? (
            <CreditReviewBody
              quote={quote}
              poolNames={get.review.route.hops.map((hop) => hop.pool.name)}
              labels={labels}
              locale={locale}
            />
          ) : null}
          {get.requoted ? (
            <p role="status" className="px-6 pb-2 text-xs text-muted-foreground">
              <Trans>Amounts changed. Review again.</Trans>
            </p>
          ) : null}
          {get.quoteError && get.review ? (
            <div className="px-6 pb-2">
              <CreditFailureNotice error={get.quoteError} />
            </div>
          ) : null}
          {get.relayError ? (
            <div className="px-6 pb-2">
              <CreditFailureNotice error={get.relayError} />
            </div>
          ) : null}
          <SheetFooter className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <Button
              tap
              className="w-full"
              pending={get.relaying}
              disabled={get.relayError instanceof CreditQuoteRefusedError}
              onClick={() => void get.confirm()}
            >
              {get.relaying ? <Trans>Signing…</Trans> : <Trans>Confirm</Trans>}
            </Button>
            <Button
              variant="ghost"
              tap
              className="w-full"
              disabled={get.relaying}
              onClick={get.closeReview}
            >
              <Trans>Cancel</Trans>
            </Button>
          </SheetFooter>
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}

/**
 * The quote as a short summary: what is spent and got, the minimum when
 * spending, any extra when getting, and the fee. The swaps, their fees, any
 * bridge remainder and the quote's expiry fold into Route details.
 */
function CreditReviewBody({
  quote,
  poolNames,
  labels,
  locale,
}: {
  quote: CreditQuote;
  poolNames: string[];
  labels: Labels;
  locale: string;
}) {
  const input = quote.hops[0]!.tokenIn;
  const output = quote.hops.at(-1)!.tokenOut;
  const amount = (address: string, raw: string) =>
    `${amountOf(labels, address, raw, locale) ?? "—"} ${symbolOf(labels, address)}`;
  // A fee too small for two places reads "<0.01", never a zero beside a short amount.
  const fee = (address: string, raw: string) => {
    const decimals = labels.get(address.toLowerCase())?.decimals;
    if (decimals === null || decimals === undefined) return "—";
    return `${formatPoolSwapFee(raw, decimals, locale)} ${symbolOf(labels, address)}`;
  };
  // Getting an exact amount guarantees it, so only spending has a minimum to state.
  const spending = quote.mode === "exactInput";
  const extra = !spending && BigInt(quote.surplus.output) > 0n;
  const bridgeSurplus = quote.surplus.bridge.filter((entry) => BigInt(entry.amount) > 0n);
  const expires = new Date(quote.expiresAt * 1000).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="max-h-[55svh] space-y-3 overflow-y-auto px-6 pb-2">
      <div className="border border-border bg-card">
        <ReviewRow label={<Trans>You spend</Trans>}>{amount(input, quote.amountIn)}</ReviewRow>
        <ReviewRow label={<Trans>You get</Trans>}>{amount(output, quote.amountOut)}</ReviewRow>
        {spending ? (
          <ReviewRow label={<Trans>Minimum received</Trans>}>
            {amount(output, quote.minAmountOut)}
          </ReviewRow>
        ) : null}
        {extra ? (
          <ReviewRow label={<Trans>Extra received</Trans>}>
            {amount(output, quote.surplus.output)}
          </ReviewRow>
        ) : null}
        <ReviewRow label={<Trans>Fee</Trans>} last>
          {formatFeePpm(quote.fees.effectiveFeePpm, locale) ?? "—"}
        </ReviewRow>
      </div>
      <details className="border border-border bg-card">
        {/* The sheet's swipe would capture a mouse press here and swallow the toggle. */}
        <summary
          data-base-ui-swipe-ignore=""
          className="flex min-h-11 cursor-pointer items-center px-3 font-semibold text-sm"
        >
          <Trans>Route details</Trans>
          {" · "}
          <SwapCount hops={quote.hops.length} />
        </summary>
        <div className="border-t border-border">
          {quote.hops.map((hop, index) => {
            const position = formatTokenAmountFixed(String(index + 1), 0, 0, locale);
            const path = `${symbolOf(labels, hop.tokenIn)} → ${symbolOf(labels, hop.tokenOut)}`;
            const poolName = poolNames[index] ?? hop.pool;
            return (
              <div key={`${hop.pool}-${index}`} className="border-b border-border">
                <p className="px-3 pt-2.5 text-xs font-semibold">
                  <Trans>
                    Swap {position}: <span dir="ltr">{path}</span> · {poolName}
                  </Trans>
                </p>
                <ReviewRow label={<Trans>Pool fee</Trans>} last>
                  {fee(hop.tokenOut, hop.poolFee)}
                </ReviewRow>
                <ReviewRow label={<Trans>Protocol fee</Trans>} last>
                  {fee(hop.tokenOut, hop.protocolFee)}
                </ReviewRow>
              </div>
            );
          })}
          {bridgeSurplus.map((entry) => (
            <ReviewRow key={entry.voucher} label={<Trans>Left in your wallet</Trans>}>
              {amount(entry.voucher, entry.amount)}
            </ReviewRow>
          ))}
          <ReviewRow label={<Trans>Quote valid until</Trans>} last>
            {expires}
          </ReviewRow>
        </div>
      </details>
    </div>
  );
}

function ReviewRow({
  label,
  last = false,
  children,
}: {
  label: React.ReactNode;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-h-11 items-center justify-between gap-3 px-3 py-2",
        !last && "border-b border-border",
      )}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span dir="ltr" className="min-w-0 break-words text-end font-mono text-xs font-semibold">
        {children}
      </span>
    </div>
  );
}
