import type { PoolSwapFeeBreakdownRaw } from "@clc/core/features/pool-swaps/logic";
import { formatTokenAmountFixed } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { RiArrowDownSLine, RiCheckLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { SectionHeading } from "#/components/ui/section-heading";
import { TokenLogo, type WalletToken, WalletAmountInput } from "#/components/wallet";
import { BackChevron } from "#/components/wallet/wallet-kit";
import { type PoolSwapField, usePoolSwapForm } from "#/features/pools/hooks/use-pool-swap-form";
import type { PoolSwapToken } from "#/features/pools/logic/pool-swap-tokens";
import { cn } from "#/lib/utils";
import { PoolSwapFeeValue } from "./pool-swap-fee-value";

export function PoolSwapPage({
  poolAddress,
  receiveTokenAddress,
}: {
  poolAddress: string;
  /** A voucher to open the "You receive" side on, from the screen that linked here. */
  receiveTokenAddress?: string;
}) {
  const { t } = useLingui();
  const receiveLabel = t`You receive`;
  const sendLabel = t`You send`;
  const swap = usePoolSwapForm({ poolAddress, receiveTokenAddress });
  const { pool, poolQuery, locale, selectedFrom, selectedTo, notice } = swap;
  const [picker, setPicker] = useState<null | { field: PoolSwapField }>(null);
  const detailFallback = `/pools/${poolAddress}`;

  if (poolQuery.isLoading) {
    return <SwapShell fallbackTo={detailFallback} message={t`Loading pool…`} />;
  }
  if (poolQuery.isError) {
    return <SwapShell fallbackTo={detailFallback} message={t`Couldn't load this pool.`} />;
  }
  if (!pool) {
    return <SwapShell fallbackTo={detailFallback} message={t`Pool not found.`} />;
  }
  if (pool.active === false) {
    return (
      <SwapShell
        fallbackTo={detailFallback}
        message={t`This pool is retired. New swaps and deposits are not available.`}
      />
    );
  }

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-bottom-nav">
      <BackChevron label={t`Pool`} to={detailFallback} />

      <h1 className="font-heading mb-3.5 text-[1.75rem] font-bold leading-tight">
        <Trans>Swap</Trans>
      </h1>

      <div className="mt-1 space-y-2">
        <SwapField
          id="swap-receive-amount"
          highlighted
          label={receiveLabel}
          token={selectedTo?.token}
          amount={swap.toAmount}
          unitValue={swap.toUnitValue ?? undefined}
          autoFocus
          max={swap.maxReceiveAmount}
          actionsDisabled={!swap.maxSettled}
          onFocus={() => swap.focusField("to")}
          onBlur={() => swap.blurField("to")}
          onAmountChange={(amount) => swap.changeAmount("to", amount)}
          onMax={swap.applyMax}
          onSelect={() => setPicker({ field: "to" })}
        />
        <SwapField
          id="swap-send-amount"
          label={sendLabel}
          token={selectedFrom?.token}
          amount={swap.fromAmount}
          unitValue={swap.fromUnitValue ?? undefined}
          max={swap.maxFromAmount}
          actionsDisabled={!swap.maxSettled}
          invalid={swap.fromInvalid}
          onFocus={() => swap.focusField("from")}
          onBlur={() => swap.blurField("from")}
          onAmountChange={(amount) => swap.changeAmount("from", amount)}
          onMax={swap.applyMax}
          onSelect={() => setPicker({ field: "from" })}
        />
      </div>

      <div className="mt-3 border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-muted-foreground text-xs">
            <Trans>Rate</Trans>
          </span>
          <span dir="ltr" className="font-mono text-xs font-semibold">
            1 {selectedFrom?.token.symbol ?? "—"} = {swap.rate ?? "—"}{" "}
            {selectedTo?.token.symbol ?? "—"}
          </span>
        </div>
        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2">
          <span className="text-muted-foreground text-xs">
            <Trans>Pool fee</Trans>
          </span>
          <PoolSwapFeeValue
            breakdown={swap.feeBreakdown}
            part="pool"
            decimals={swap.toDecimals}
            symbol={swap.receiveSymbol}
            locale={locale}
            pending={swap.feesPending}
          />
        </div>
        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2">
          <span className="text-muted-foreground text-xs">
            <Trans>Protocol fee</Trans>
          </span>
          <PoolSwapFeeValue
            breakdown={swap.feeBreakdown}
            part="protocol"
            decimals={swap.toDecimals}
            symbol={swap.receiveSymbol}
            locale={locale}
            pending={swap.feesPending}
          />
        </div>
        <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2">
          <span className="text-muted-foreground text-xs">
            <Trans>Total fees</Trans>
          </span>
          <PoolSwapFeeValue
            breakdown={swap.feeBreakdown}
            part="total"
            decimals={swap.toDecimals}
            symbol={swap.receiveSymbol}
            locale={locale}
            pending={swap.feesPending}
          />
        </div>
      </div>

      {notice?.kind === "tokensPending" ? (
        <p className="mt-2 text-muted-foreground text-xs">
          <Trans>Checking which vouchers this pool takes…</Trans>
        </p>
      ) : notice?.kind === "tokensError" ? (
        <div className="mt-2 space-y-2">
          <p role="alert" className="text-destructive text-xs">
            <Trans>Couldn't check which vouchers this pool takes.</Trans>
          </p>
          <Button variant="outline" tap onClick={swap.retryTokens} pending={swap.tokensRetrying}>
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : notice?.kind === "noTokens" ? (
        <p role="alert" className="mt-2 text-muted-foreground text-xs">
          <Trans>This pool doesn't take any vouchers yet.</Trans>
        </p>
      ) : notice?.kind === "nothingHeld" ? (
        <p role="alert" className="mt-2 text-muted-foreground text-xs">
          <Trans>You don't hold any voucher this pool takes.</Trans>
        </p>
      ) : notice?.kind === "quoteError" ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p
            role="alert"
            aria-label={t`Couldn't estimate this swap.`}
            className="text-destructive text-xs"
          >
            <Trans>Couldn't estimate this swap.</Trans>
          </p>
          <Button variant="outline" tap pending={swap.quoteRetrying} onClick={swap.retryQuote}>
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : notice?.kind === "exceedsBalance" ? (
        <p role="alert" className="mt-2 text-destructive text-xs">
          <Trans>Amount exceeds your balance</Trans>
        </p>
      ) : notice?.kind === "depositCap" ? (
        <p role="alert" className="mt-2 text-destructive text-xs">
          {notice.full ? (
            <Trans>This pool can't take any more {selectedFrom?.token.symbol} right now.</Trans>
          ) : (
            <Trans>
              This pool can only take {swap.depositHeadroom} more {selectedFrom?.token.symbol} right
              now.
            </Trans>
          )}
        </p>
      ) : notice?.kind === "liquidity" ? (
        <p role="alert" className="mt-2 text-destructive text-xs">
          {notice.empty ? (
            <Trans>This pool has no {selectedTo?.token.symbol} available to swap.</Trans>
          ) : (
            <Trans>
              This pool only has {swap.availableAmountOut} {selectedTo?.token.symbol} available to
              swap.
            </Trans>
          )}
        </p>
      ) : notice?.kind === "nonPositive" ? (
        <p role="alert" className="mt-2 text-destructive text-xs">
          <Trans>Enter an amount greater than zero.</Trans>
        </p>
      ) : null}

      <div className="flex-1" />

      <Button
        tap
        className="w-full"
        disabled={!swap.canReview}
        pending={swap.inFlight}
        onClick={swap.openConfirm}
      >
        <Trans>Swap</Trans>
      </Button>

      <PoolTokenPickerSheet
        open={picker?.field === "from"}
        onOpenChange={(open) => {
          if (!open) setPicker(null);
        }}
        variant="from"
        title={sendLabel}
        tokens={swap.swapTokens}
        selectedId={selectedFrom?.id}
        isPending={swap.tokensPending}
        isError={swap.tokensError}
        locale={locale}
        onSelect={swap.selectFrom}
      />
      <PoolTokenPickerSheet
        open={picker?.field === "to"}
        onOpenChange={(open) => {
          if (!open) setPicker(null);
        }}
        variant="to"
        title={receiveLabel}
        tokens={swap.receiveTokens}
        selectedId={selectedTo?.id}
        isPending={swap.tokensPending}
        isError={swap.tokensError}
        locale={locale}
        onSelect={swap.selectTo}
      />
      <SwapConfirmationSheet
        open={swap.confirmOpen}
        onOpenChange={swap.setConfirmOpen}
        fromAmount={swap.confirmFromAmount}
        fromSymbol={selectedFrom?.token.symbol ?? ""}
        fromUnitValue={swap.fromUnitValue}
        toAmount={swap.confirmToAmount}
        toSymbol={selectedTo?.token.symbol ?? ""}
        toUnitValue={swap.toUnitValue}
        feeBreakdown={swap.confirmFeeBreakdown}
        feeDecimals={swap.toDecimals}
        locale={locale}
        poolName={pool.name}
        error={swap.confirmError}
        isPending={swap.inFlight}
        onConfirm={swap.confirm}
      />
    </div>
  );
}

function SwapConfirmationSheet({
  open,
  onOpenChange,
  fromAmount,
  fromSymbol,
  fromUnitValue,
  toAmount,
  toSymbol,
  toUnitValue,
  feeBreakdown,
  feeDecimals,
  locale,
  poolName,
  error,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fromAmount: string;
  fromSymbol: string;
  fromUnitValue: string | null;
  toAmount: string;
  toSymbol: string;
  toUnitValue: string | null;
  feeBreakdown: PoolSwapFeeBreakdownRaw | null;
  feeDecimals: number | null;
  locale: string;
  poolName: string;
  error: string | null;
  isPending: boolean;
  onConfirm: () => Promise<void>;
}) {
  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="[&>div:first-child]:hidden">
          <SheetHeader className="px-6 pt-5 pb-3">
            <SheetTitle>
              <Trans>Confirm swap</Trans>
            </SheetTitle>
          </SheetHeader>
          <div className="px-6 pb-2">
            <div className="border border-border bg-card">
              <SwapConfirmationRow label={<Trans>You receive</Trans>}>
                {toAmount} {toSymbol}
                {toUnitValue ? ` (${toUnitValue})` : ""}
              </SwapConfirmationRow>
              <SwapConfirmationRow label={<Trans>You send</Trans>}>
                {fromAmount} {fromSymbol}
                {fromUnitValue ? ` (${fromUnitValue})` : ""}
              </SwapConfirmationRow>
              <SwapConfirmationRow label={<Trans>Pool fee</Trans>}>
                <PoolSwapFeeValue
                  breakdown={feeBreakdown}
                  part="pool"
                  decimals={feeDecimals}
                  symbol={toSymbol}
                  locale={locale}
                />
              </SwapConfirmationRow>
              <SwapConfirmationRow label={<Trans>Protocol fee</Trans>}>
                <PoolSwapFeeValue
                  breakdown={feeBreakdown}
                  part="protocol"
                  decimals={feeDecimals}
                  symbol={toSymbol}
                  locale={locale}
                />
              </SwapConfirmationRow>
              <SwapConfirmationRow label={<Trans>Total fees</Trans>}>
                <PoolSwapFeeValue
                  breakdown={feeBreakdown}
                  part="total"
                  decimals={feeDecimals}
                  symbol={toSymbol}
                  locale={locale}
                />
              </SwapConfirmationRow>
              <SwapConfirmationRow label={<Trans>Pool</Trans>} last>
                {poolName}
              </SwapConfirmationRow>
            </div>
          </div>
          {error ? (
            <p className="px-6 pb-2 text-destructive text-xs" role="alert">
              {error}
            </p>
          ) : null}
          <SheetFooter className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <Button tap className="w-full" pending={isPending} onClick={() => void onConfirm()}>
              {isPending ? <Trans>Swapping…</Trans> : <Trans>Confirm swap</Trans>}
            </Button>
            <Button
              variant="ghost"
              tap
              className="w-full"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              <Trans>Cancel</Trans>
            </Button>
          </SheetFooter>
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}

function SwapConfirmationRow({
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
        "flex min-h-11 items-center justify-between gap-3 px-3 py-2.5",
        !last && "border-b border-border",
      )}
    >
      <span className="text-muted-foreground text-xs">{label}</span>
      <span dir="ltr" className="min-w-0 break-words text-end font-mono text-xs font-semibold">
        {children}
      </span>
    </div>
  );
}

/**
 * One side of the swap: a voucher selector and its amount, on the page's own
 * background. The amount's outline is the only box — a panel around it would nest
 * one bordered surface inside another.
 *
 * Both sides are the same size and share one selector column, so the two
 * vouchers line up whatever their symbols are. `highlighted` outlines the amount
 * in the brand colour: the side a holder is expected to fill in.
 */
function SwapField({
  id,
  highlighted = false,
  label,
  token,
  amount,
  unitValue,
  autoFocus = false,
  max,
  actionsDisabled = false,
  invalid = false,
  onFocus,
  onBlur,
  onAmountChange,
  onMax,
  onSelect,
}: {
  id: string;
  highlighted?: boolean;
  label: string;
  token: WalletToken | undefined;
  amount: string;
  unitValue?: string;
  autoFocus?: boolean;
  max?: string;
  /** Max stays visible but cannot be tapped while its figure is a stale one. */
  actionsDisabled?: boolean;
  invalid?: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onAmountChange: (amount: string) => void;
  onMax?: () => void;
  onSelect: () => void;
}) {
  const symbol = token?.symbol ?? "";
  return (
    <div role="group" aria-label={label}>
      <div className="mb-1.5 flex min-h-7 items-center justify-between">
        <label htmlFor={id} className="font-medium text-sm">
          {label}
        </label>
        {max !== undefined ? (
          <Button
            variant="ghost"
            tap
            disabled={actionsDisabled}
            onClick={onMax}
            className="font-mono font-semibold"
          >
            <Trans>
              Max {max} {symbol}
            </Trans>
          </Button>
        ) : null}
      </div>
      <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-stretch gap-2">
        <button
          type="button"
          onClick={onSelect}
          className="flex min-h-9 items-center gap-1.5 border border-border bg-card px-2"
        >
          {token ? (
            <TokenLogo token={token} size={24} />
          ) : (
            <span className="size-6 shrink-0 rounded-full bg-muted" />
          )}
          <span
            dir="ltr"
            className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-start text-sm font-semibold"
          >
            {token?.symbol ?? "—"}
          </span>
          <RiArrowDownSLine className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
        <WalletAmountInput
          id={id}
          label={label}
          highlighted={highlighted}
          value={amount}
          onValueChange={onAmountChange}
          onFocus={onFocus}
          onBlur={onBlur}
          autoFocus={autoFocus}
          aria-invalid={invalid}
        />
      </div>
      {unitValue ? (
        <p className="mt-1 text-end font-mono text-muted-foreground text-xs" aria-live="polite">
          ({unitValue})
        </p>
      ) : null}
    </div>
  );
}

/**
 * The pool's whole menu, with the reason any row is unusable stated on the row.
 *
 * The From side splits at "Not held" rather than hiding what you do not hold: a
 * holder who came here knowing this pool takes their voucher needs to see it
 * listed, and an empty list cannot tell them whether the pool changed or the
 * screen is broken.
 */
function PoolTokenPickerSheet({
  open,
  onOpenChange,
  variant,
  title,
  tokens,
  selectedId,
  isPending,
  isError,
  locale,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: "from" | "to";
  title: string;
  tokens: PoolSwapToken[];
  selectedId?: string;
  isPending: boolean;
  isError: boolean;
  locale: string;
  onSelect: (token: PoolSwapToken) => void;
}) {
  const selectable = (token: PoolSwapToken) =>
    variant === "from" ? token.canSwapIn : token.canSwapOut;
  // `buildPoolSwapTokens` already orders held-first, so the divider is a single
  // index rather than a second pass over the list.
  const firstUnheldIndex = variant === "from" ? tokens.findIndex((token) => !token.held) : -1;

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="[&>div:first-child]:hidden">
          <SheetHeader className="px-6 pt-5 pb-3">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <div className="max-h-[50svh] overflow-y-auto px-2 pb-2">
            {isPending ? (
              <p className="px-4 py-3 text-muted-foreground text-sm">
                <Trans>Loading vouchers…</Trans>
              </p>
            ) : isError ? (
              <p role="alert" className="px-4 py-3 text-destructive text-sm">
                <Trans>Couldn't load this pool's vouchers.</Trans>
              </p>
            ) : tokens.length === 0 ? (
              <p className="px-4 py-3 text-muted-foreground text-sm">
                <Trans>This pool doesn't take any vouchers yet.</Trans>
              </p>
            ) : (
              tokens.map((token, index) => (
                <div key={token.id}>
                  {index === firstUnheldIndex && index > 0 ? (
                    <SectionHeading variant="group" as="h3" className="px-4 pt-3 pb-1">
                      <Trans>Not held</Trans>
                    </SectionHeading>
                  ) : null}
                  <PoolTokenPickerRow
                    token={token}
                    variant={variant}
                    selected={token.id === selectedId}
                    disabled={!selectable(token)}
                    locale={locale}
                    onSelect={() => {
                      onSelect(token);
                      onOpenChange(false);
                    }}
                  />
                </div>
              ))
            )}
          </div>
          <SheetFooter className="px-6 pb-[max(1rem,env(safe-area-inset-bottom))]" />
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}

function PoolTokenPickerRow({
  token,
  variant,
  selected,
  disabled,
  locale,
  onSelect,
}: {
  token: PoolSwapToken;
  variant: "from" | "to";
  selected: boolean;
  disabled: boolean;
  locale: string;
  onSelect: () => void;
}) {
  const amountRaw = variant === "from" ? token.balanceRaw : token.liquidityRaw;
  const amount =
    token.decimals === null ? "—" : formatTokenAmountFixed(amountRaw, token.decimals, 2, locale);

  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3 text-start active:bg-muted",
        selected && "bg-muted/60",
        disabled && "opacity-45",
      )}
      onClick={onSelect}
    >
      <TokenLogo token={token.token} size={34} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm">{token.token.symbol}</p>
        <p className="truncate text-muted-foreground text-xs">{token.token.name}</p>
        <PoolTokenPickerReason token={token} variant={variant} />
      </div>
      <span dir="ltr" className="shrink-0 font-mono text-xs font-semibold">
        {amount}
      </span>
      {selected ? (
        <RiCheckLine className="size-5 shrink-0 text-primary" aria-hidden="true" />
      ) : null}
    </button>
  );
}

/**
 * Why a row cannot be picked, where the balance beside it does not already say.
 *
 * "Not held" is the section heading's job, so a zero balance under it carries no
 * extra line. The other two are facts about the pool that nothing else on the row
 * reveals, and a holder who is not told will read the dimming as a bug.
 */
function PoolTokenPickerReason({
  token,
  variant,
}: {
  token: PoolSwapToken;
  variant: "from" | "to";
}) {
  if (token.decimals === null) {
    return (
      <p className="text-xs text-muted-foreground">
        <Trans>Voucher details unavailable</Trans>
      </p>
    );
  }
  if (variant === "from" && token.held && token.depositHeadroomRaw === "0") {
    return (
      <p className="text-xs text-muted-foreground">
        <Trans>The credit limit has been reached. No more can be added to this pool.</Trans>
      </p>
    );
  }
  if (variant === "to" && !token.canSwapOut) {
    return (
      <p className="text-xs text-muted-foreground">
        <Trans>None left to swap for</Trans>
      </p>
    );
  }
  return null;
}

function SwapShell({ fallbackTo, message }: { fallbackTo: string; message: string }) {
  const { t } = useLingui();
  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)]">
      <BackChevron label={t`Pool`} to={fallbackTo} />
      <p className="mt-4 text-muted-foreground text-sm">{message}</p>
    </div>
  );
}
