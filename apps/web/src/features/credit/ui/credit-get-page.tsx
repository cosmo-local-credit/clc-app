import type {
  CreditFallbackPool,
  CreditQuote,
  CreditRoute,
} from "@clc/api/features/credit-router/client";
import { formatCreditRate, formatFeePpm } from "@clc/core/features/credit-router/logic";
import { formatTokenAmountFixed } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useRef } from "react";
import { RiArrowRightLine } from "react-icons/ri";

import { SwapCount } from "#/components/credit/credit-hops";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
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
import { Toggle } from "#/components/ui/toggle";
import { WalletAmountInput } from "#/components/wallet";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { CreditQuoteRefusedError } from "#/features/credit/api/relay-credit-quote";
import { type CreditGet, useCreditGet } from "#/features/credit/hooks/use-credit-get";
import { type VoucherLabel, useVoucherLabels } from "#/features/credit/hooks/use-voucher-labels";
import { creditRouteKey, creditRouteVouchers } from "#/features/credit/logic/credit-routes";
import { formatPoolSwapFee } from "#/features/pools/logic/pool-swap-fees";
import { cn } from "#/lib/utils";
import { CreditFailureNotice } from "./credit-failure-notice";

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
 * Get a voucher with the vouchers the wallet already holds, through as many
 * pools as the router routes. Routes come from the server's discovery
 * (estimates); the exchange is priced by an authoritative quote, checked
 * against the request and the review, and signed by the app over its own
 * digest.
 */
export function CreditGetPage({ voucherAddress }: { voucherAddress: `0x${string}` }) {
  const { t, i18n } = useLingui();
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const get = useCreditGet(voucherAddress);
  const amountInput = useRef<HTMLInputElement>(null);
  const routeVouchers = get.groups.flatMap((group) =>
    group.routes.flatMap((route) => creditRouteVouchers(route)),
  );
  const fallbackVouchers = get.fallbackPools.flatMap((pool) => pool.accepts.slice(0, 4));
  const labels = useVoucherLabels([
    voucherAddress,
    ...get.inputVouchers.map((input) => input.voucher),
    ...routeVouchers,
    ...fallbackVouchers,
  ]);
  const targetSymbol = get.target?.symbol ?? get.targetLabel?.symbol ?? "";
  const amountSymbol =
    get.mode === "exactOutput"
      ? targetSymbol
      : get.spendVoucher
        ? symbolOf(labels, get.spendVoucher)
        : "";
  const heldAmount = get.heldBalance
    ? amountOf(labels, voucherAddress, get.heldBalance, locale)
    : null;
  const noRoutes =
    !get.routesPending &&
    !get.routesError &&
    get.groups.every((group) => group.routes.length === 0);

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-bottom-nav">
      <BackChevron label={t`Voucher`} to={`/vouchers/${voucherAddress}`} />
      <h1 className="font-heading mb-3.5 text-[1.75rem] font-bold leading-tight">
        <Trans>Get {targetSymbol}</Trans>
      </h1>

      <div className="flex gap-2" role="group" aria-label={t`Amount`}>
        <Toggle
          variant="outline"
          pressed={get.mode === "exactOutput"}
          onPressedChange={() => get.setMode("exactOutput")}
        >
          <Trans>Amount to get</Trans>
        </Toggle>
        <Toggle
          variant="outline"
          pressed={get.mode === "exactInput"}
          onPressedChange={() => get.setMode("exactInput")}
          disabled={get.inputVouchers.length === 0}
        >
          <Trans>Amount to spend</Trans>
        </Toggle>
      </div>

      {get.mode === "exactInput" && get.inputVouchers.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t`Voucher to spend`}>
          {get.inputVouchers.map((input) => (
            <Toggle
              key={input.voucher}
              variant="outline"
              pressed={get.spendVoucher?.toLowerCase() === input.voucher.toLowerCase()}
              onPressedChange={() => get.chooseSpendVoucher(input.voucher)}
            >
              <span dir="ltr" className="font-mono">
                {symbolOf(labels, input.voucher)}
              </span>
            </Toggle>
          ))}
        </div>
      ) : null}

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

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
        {get.stale ? (
          <span role="status">
            <Trans>Options may be out of date.</Trans>
          </span>
        ) : null}
      </div>

      {heldAmount ? (
        <p role="status" className="mt-4 border border-border bg-card p-3 text-sm">
          <Trans>
            You already have{" "}
            <span dir="ltr" className="font-mono font-semibold">
              {heldAmount} {targetSymbol}
            </span>
          </Trans>
        </p>
      ) : null}

      <div className="mt-4 space-y-5">
        {get.routesPending ? (
          <p className="text-sm text-muted-foreground" role="status">
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
        {get.groups.map((group) =>
          group.routes.length === 0 ? null : (
            <section key={group.voucher} className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <SectionHeading variant="section" as="h2">
                  <Trans>Pay with {symbolOf(labels, group.voucher)}</Trans>
                </SectionHeading>
                <span dir="ltr" className="font-mono text-xs font-semibold text-muted-foreground">
                  {amountOf(labels, group.voucher, group.walletBalance, locale) ?? "—"}
                </span>
              </div>
              {group.routes.map((route) => (
                <CreditRouteRow
                  key={creditRouteKey(route)}
                  route={route}
                  labels={labels}
                  locale={locale}
                  mode={get.mode}
                  sized={get.amountRaw !== undefined}
                  selected={get.selectedKey === creditRouteKey(route)}
                  onSelect={() => get.selectRoute(route)}
                />
              ))}
            </section>
          ),
        )}
        {get.hasMoreRoutes ? (
          <Button
            variant="outline"
            tap
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

function CreditRouteRow({
  route,
  labels,
  locale,
  mode,
  sized,
  selected,
  onSelect,
}: {
  route: CreditRoute;
  labels: Labels;
  locale: string;
  mode: CreditGet["mode"];
  sized: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const vouchers = creditRouteVouchers(route);
  const input = vouchers[0]!;
  const output = vouchers.at(-1)!;
  const inLabel = labels.get(input.toLowerCase());
  const outLabel = labels.get(output.toLowerCase());
  const rate =
    route.rate && inLabel?.decimals != null && outLabel?.decimals != null
      ? formatCreditRate({
          amountIn: route.rate.amountIn,
          amountOut: route.rate.amountOut,
          decimalsIn: inLabel.decimals,
          decimalsOut: outLabel.decimals,
          locale,
        })
      : null;
  const fee = formatFeePpm(route.effectiveFeePpm, locale);
  const feeUnconfirmed = route.hops.some((hop) => hop.feeSource === "default");
  const maxOut = route.maxAmountOut ? amountOf(labels, output, route.maxAmountOut, locale) : null;
  const hops = route.hops.length;
  const pools = new Intl.ListFormat(locale, { type: "unit", style: "short" }).format(
    route.hops.map((hop) => hop.pool.name),
  );

  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={sized && route.carriesAmount === false}
      onClick={onSelect}
      className={cn(
        "w-full border border-border bg-card p-3 text-start disabled:opacity-60",
        selected && "shadow-[inset_2px_0_0_0_var(--color-primary)] bg-primary/5",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span dir="ltr" className="flex min-w-0 items-center gap-1 font-mono text-xs font-semibold">
          {vouchers.map((voucher, index) => (
            <span key={`${voucher}-${index}`} className="flex items-center gap-1">
              {index > 0 ? (
                <RiArrowRightLine className="size-3 text-muted-foreground" aria-hidden="true" />
              ) : null}
              {symbolOf(labels, voucher)}
            </span>
          ))}
        </span>
        <Badge size="sm" variant="muted">
          <SwapCount hops={hops} />
        </Badge>
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        <Trans>via {pools}</Trans>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {rate ? (
          <span dir="ltr" className="font-mono font-semibold">
            1 {symbolOf(labels, input)} = {rate} {symbolOf(labels, output)}
          </span>
        ) : null}
        {fee ? (
          <span className="font-mono font-semibold">
            <Trans>Fee {fee}</Trans>
          </span>
        ) : null}
        <Badge size="sm" variant="outline">
          {feeUnconfirmed ? <Trans>Fee not confirmed</Trans> : <Trans>Estimate</Trans>}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {maxOut ? (
          route.maxIsExact ? (
            <Trans>
              Up to{" "}
              <span dir="ltr" className="font-mono font-semibold text-foreground">
                {maxOut} {symbolOf(labels, output)}
              </span>
            </Trans>
          ) : (
            <Trans>
              At least{" "}
              <span dir="ltr" className="font-mono font-semibold text-foreground">
                {maxOut} {symbolOf(labels, output)}
              </span>
            </Trans>
          )
        ) : (
          <Trans>Capacity unknown</Trans>
        )}
        {route.limitedBy === "wallet" ? (
          <>
            {" · "}
            <Trans>limited by your balance</Trans>
          </>
        ) : route.limitedBy === "deposit_cap" ? (
          <>
            {" · "}
            <Trans>limited by a pool's credit limit</Trans>
          </>
        ) : route.limitedBy === "liquidity" ? (
          <>
            {" · "}
            <Trans>limited by pool liquidity</Trans>
          </>
        ) : null}
      </p>
      {sized && route.carriesAmount && route.amountIn && route.amountOut ? (
        <p className="mt-1 text-xs">
          {mode === "exactOutput" ? (
            <Trans>
              Costs about{" "}
              <span dir="ltr" className="font-mono font-semibold">
                {amountOf(labels, input, route.amountIn, locale) ?? "—"} {symbolOf(labels, input)}
              </span>
            </Trans>
          ) : (
            <Trans>
              Gets about{" "}
              <span dir="ltr" className="font-mono font-semibold">
                {amountOf(labels, output, route.amountOut, locale) ?? "—"}{" "}
                {symbolOf(labels, output)}
              </span>
            </Trans>
          )}
        </p>
      ) : sized && route.carriesAmount === false ? (
        <p className="mt-1 text-xs text-destructive">
          <Trans>Can't carry this amount</Trans>
        </p>
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
      <p className="text-sm text-muted-foreground">
        <Trans>No route from your vouchers reaches {targetSymbol}.</Trans>
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
  const outputSurplus = BigInt(quote.surplus.output) > 0n;
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
        <ReviewRow label={<Trans>Minimum received</Trans>}>
          {amount(output, quote.minAmountOut)}
        </ReviewRow>
        <ReviewRow label={<Trans>Effective fee</Trans>}>
          {formatFeePpm(quote.fees.effectiveFeePpm, locale) ?? "—"}
        </ReviewRow>
        {outputSurplus ? (
          <ReviewRow label={<Trans>Extra received</Trans>}>
            {amount(output, quote.surplus.output)}
          </ReviewRow>
        ) : null}
        {bridgeSurplus.map((entry) => (
          <ReviewRow key={entry.voucher} label={<Trans>Left in your wallet</Trans>}>
            {amount(entry.voucher, entry.amount)}
          </ReviewRow>
        ))}
        <ReviewRow label={<Trans>Quote valid until</Trans>} last>
          {expires}
        </ReviewRow>
      </div>
      {quote.hops.map((hop, index) => (
        <div key={`${hop.pool}-${index}`} className="border border-border bg-card">
          <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
            <span className="min-w-0 truncate text-sm font-semibold">
              <Trans>
                Hop {index + 1} · {poolNames[index] ?? hop.pool}
              </Trans>
            </span>
            <span dir="ltr" className="shrink-0 font-mono text-xs font-semibold">
              {symbolOf(labels, hop.tokenIn)} → {symbolOf(labels, hop.tokenOut)}
            </span>
          </div>
          <ReviewRow label={<Trans>Sent</Trans>}>{amount(hop.tokenIn, hop.amountIn)}</ReviewRow>
          <ReviewRow label={<Trans>Pool fee</Trans>}>{fee(hop.tokenOut, hop.poolFee)}</ReviewRow>
          <ReviewRow label={<Trans>Protocol fee</Trans>}>
            {fee(hop.tokenOut, hop.protocolFee)}
          </ReviewRow>
          <ReviewRow label={<Trans>Received</Trans>} last>
            {amount(hop.tokenOut, hop.netOut)}
          </ReviewRow>
        </div>
      ))}
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
