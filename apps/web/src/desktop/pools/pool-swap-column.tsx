import type { PoolSwapFeeBreakdownRaw } from "@clc/core/features/pool-swaps/logic";
import { formatTokenAmountFixed } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { type ReactNode, useState } from "react";
import { RiArrowDownSLine, RiArrowUpDownLine, RiCheckLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { PopoverContent, PopoverRoot, PopoverTitle, PopoverTrigger } from "#/components/ui/popover";
import { SectionHeading } from "#/components/ui/section-heading";
import { TokenLogo, type WalletToken, WalletAmountInput } from "#/components/wallet";
import { DeskSwapFee } from "#/desktop/pools/detail/desk-swap-fee";
import { DeskKV } from "#/desktop/ui/kv";
import { type PoolSwapField, usePoolSwapForm } from "#/features/pools/hooks/use-pool-swap-form";
import type { PoolSwapNotice } from "#/features/pools/logic/pool-swap-form";
import type { PoolSwapToken } from "#/features/pools/logic/pool-swap-tokens";
import { cn } from "#/lib/utils";

/**
 * The pool's swap, in the detail page's 360px side column. Everything it
 * decides comes from `usePoolSwapForm`, the phone swap's own hook — this file
 * only lays it out.
 */
export function PoolSwapColumn({
  poolAddress,
  receiveTokenAddress,
  focused = false,
}: {
  poolAddress: string;
  receiveTokenAddress?: string;
  focused?: boolean;
}) {
  const { t } = useLingui();
  const receiveLabel = t`You receive`;
  const sendLabel = t`You send`;
  const swap = usePoolSwapForm({ poolAddress, receiveTokenAddress });
  const { pool, poolQuery, locale, selectedFrom, selectedTo } = swap;
  const [picker, setPicker] = useState<null | { field: PoolSwapField }>(null);

  const pickerFor = (field: PoolSwapField) => (
    <TokenPicker
      variant={field}
      title={field === "from" ? sendLabel : receiveLabel}
      token={field === "from" ? selectedFrom?.token : selectedTo?.token}
      tokens={field === "from" ? swap.swapTokens : swap.receiveTokens}
      selectedId={field === "from" ? selectedFrom?.id : selectedTo?.id}
      isPending={swap.tokensPending}
      isError={swap.tokensError}
      locale={locale}
      open={picker?.field === field}
      onOpenChange={(open) => setPicker(open ? { field } : null)}
      onSelect={(token) => {
        if (field === "from") swap.selectFrom(token);
        else swap.selectTo(token);
        setPicker(null);
      }}
    />
  );
  const feeValue = (
    part: "pool" | "protocol" | "total",
    breakdown: PoolSwapFeeBreakdownRaw | null,
    pending = false,
  ) => (
    <DeskSwapFee
      breakdown={breakdown}
      part={part}
      decimals={swap.toDecimals}
      symbol={swap.receiveSymbol}
      locale={locale}
      pending={pending}
    />
  );

  let body: ReactNode;
  if (poolQuery.isLoading) {
    body = <p className="text-sm text-muted-foreground">{t`Loading pool…`}</p>;
  } else if (poolQuery.isError) {
    body = (
      <div className="grid justify-items-start gap-2">
        <p className="text-sm text-muted-foreground">{t`Couldn't load this pool.`}</p>
        <Button
          variant="outline"
          tap
          pending={poolQuery.isFetching}
          onClick={() => void poolQuery.refetch()}
        >
          {t`Retry`}
        </Button>
      </div>
    );
  } else if (!pool) {
    body = <p className="text-sm text-muted-foreground">{t`Pool not found.`}</p>;
  } else if (pool.active === false) {
    body = (
      <p className="text-sm text-muted-foreground">
        {t`This pool is retired. New swaps and deposits are not available.`}
      </p>
    );
  } else if (swap.confirmOpen) {
    body = (
      <>
        <DeskKV
          rows={[
            [
              <Trans key="label">You receive</Trans>,
              <span key="value" dir="ltr">
                {swap.confirmToAmount} {selectedTo?.token.symbol ?? ""}
                {swap.toUnitValue ? ` (${swap.toUnitValue})` : ""}
              </span>,
            ],
            [
              <Trans key="label">You send</Trans>,
              <span key="value" dir="ltr">
                {swap.confirmFromAmount} {selectedFrom?.token.symbol ?? ""}
                {swap.fromUnitValue ? ` (${swap.fromUnitValue})` : ""}
              </span>,
            ],
            [<Trans key="label">Pool fee</Trans>, feeValue("pool", swap.confirmFeeBreakdown)],
            [
              <Trans key="label">Protocol fee</Trans>,
              feeValue("protocol", swap.confirmFeeBreakdown),
            ],
            [<Trans key="label">Total fees</Trans>, feeValue("total", swap.confirmFeeBreakdown)],
            [
              <Trans key="label">Pool</Trans>,
              <span key="value" dir="auto" className="font-sans">
                {pool.name}
              </span>,
            ],
          ]}
        />
        {swap.confirmError ? (
          <p className="text-xs text-destructive" role="alert">
            {swap.confirmError}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            disabled={swap.inFlight}
            onClick={() => swap.setConfirmOpen(false)}
          >
            <Trans>Cancel</Trans>
          </Button>
          <Button pending={swap.inFlight} onClick={() => void swap.confirm()}>
            {swap.inFlight ? <Trans>Swapping…</Trans> : <Trans>Confirm swap</Trans>}
          </Button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <div className="grid gap-1.5">
          <AmountBox
            id="desk-swap-send-amount"
            label={sendLabel}
            amount={swap.fromAmount}
            invalid={swap.fromInvalid}
            picker={pickerFor("from")}
            onFocus={() => swap.focusField("from")}
            onBlur={() => swap.blurField("from")}
            onAmountChange={(amount) => swap.changeAmount("from", amount)}
          />
          <AmountHelp
            lead={
              swap.fromBalance !== null ? (
                <>
                  <Trans>Balance</Trans>{" "}
                  <span dir="ltr" className="font-mono">
                    {swap.fromBalance}
                  </span>
                </>
              ) : null
            }
            unitValue={swap.fromUnitValue ?? undefined}
            max={swap.maxFromAmount}
            symbol={selectedFrom?.token.symbol}
            maxDisabled={!swap.maxSettled}
            onMax={swap.applyMax}
          />
        </div>
        <div className="grid place-items-center">
          <Button
            variant="outline"
            size="icon"
            aria-label={t`Reverse swap direction`}
            disabled={!swap.canFlip}
            onClick={swap.flip}
          >
            <RiArrowUpDownLine aria-hidden="true" />
          </Button>
        </div>
        <div className="grid gap-1.5">
          <AmountBox
            id="desk-swap-receive-amount"
            label={receiveLabel}
            amount={swap.toAmount}
            highlighted
            autoFocus={focused}
            picker={pickerFor("to")}
            onFocus={() => swap.focusField("to")}
            onBlur={() => swap.blurField("to")}
            onAmountChange={(amount) => swap.changeAmount("to", amount)}
          />
          <AmountHelp
            unitValue={swap.toUnitValue ?? undefined}
            max={swap.maxReceiveAmount}
            symbol={selectedTo?.token.symbol}
            maxDisabled={!swap.maxSettled}
            onMax={swap.applyMax}
          />
        </div>
        <DeskKV
          rows={[
            [
              <Trans key="label">Rate</Trans>,
              swap.rate !== null && selectedFrom && selectedTo ? (
                <span key="value" dir="ltr">
                  1 {selectedFrom.token.symbol} = {swap.rate} {selectedTo.token.symbol}
                </span>
              ) : (
                <span key="value" className="text-muted-foreground">
                  —
                </span>
              ),
            ],
            [
              <Trans key="label">Pool fee</Trans>,
              feeValue("pool", swap.feeBreakdown, swap.feesPending),
            ],
            [
              <Trans key="label">Protocol fee</Trans>,
              feeValue("protocol", swap.feeBreakdown, swap.feesPending),
            ],
            [
              <Trans key="label">Total fees</Trans>,
              feeValue("total", swap.feeBreakdown, swap.feesPending),
            ],
          ]}
        />
        <SwapNotices
          notice={swap.notice}
          fetching={swap.tokensRetrying}
          onRetry={swap.retryTokens}
          quoteFetching={swap.quoteRetrying}
          onQuoteRetry={swap.retryQuote}
          depositHeadroom={swap.depositHeadroom}
          fromSymbol={selectedFrom?.token.symbol}
          availableOut={swap.availableAmountOut}
          toSymbol={selectedTo?.token.symbol}
        />
        <Button
          className="w-full"
          disabled={!swap.canReview}
          pending={swap.inFlight}
          onClick={swap.openConfirm}
        >
          <Trans>Swap</Trans>
        </Button>
      </>
    );
  }

  return (
    <section
      aria-labelledby="desk-swap-title"
      className="grid min-w-0 gap-3 border border-border bg-card p-4"
    >
      <SectionHeading as="h2" variant="section" id="desk-swap-title">
        {swap.confirmOpen ? <Trans>Confirm swap</Trans> : <Trans>Swap</Trans>}
      </SectionHeading>
      {body}
    </section>
  );
}

function SwapNotices({
  notice,
  fetching,
  onRetry,
  quoteFetching,
  onQuoteRetry,
  depositHeadroom,
  fromSymbol,
  availableOut,
  toSymbol,
}: {
  notice: PoolSwapNotice | null;
  fetching: boolean;
  onRetry: () => void;
  quoteFetching: boolean;
  onQuoteRetry: () => void;
  depositHeadroom: string | null;
  fromSymbol: string | undefined;
  availableOut: string | null;
  toSymbol: string | undefined;
}) {
  const { t } = useLingui();
  switch (notice?.kind) {
    case undefined:
      return null;
    case "tokensPending":
      return (
        <p className="text-muted-foreground text-xs">
          <Trans>Checking which vouchers this pool takes…</Trans>
        </p>
      );
    case "tokensError":
      return (
        <div className="space-y-2">
          <p role="alert" className="text-destructive text-xs">
            <Trans>Couldn't check which vouchers this pool takes.</Trans>
          </p>
          <Button variant="outline" tap onClick={onRetry} pending={fetching}>
            <Trans>Try again</Trans>
          </Button>
        </div>
      );
    case "noTokens":
      return (
        <p role="alert" className="text-muted-foreground text-xs">
          <Trans>This pool doesn't take any vouchers yet.</Trans>
        </p>
      );
    case "nothingHeld":
      return (
        <p role="alert" className="text-muted-foreground text-xs">
          <Trans>You don't hold any voucher this pool takes.</Trans>
        </p>
      );
    case "quoteError":
      return (
        <div className="flex items-center justify-between gap-3">
          <p
            role="alert"
            aria-label={t`Couldn't estimate this swap.`}
            className="text-destructive text-xs"
          >
            <Trans>Couldn't estimate this swap.</Trans>
          </p>
          <Button variant="outline" tap pending={quoteFetching} onClick={onQuoteRetry}>
            <Trans>Try again</Trans>
          </Button>
        </div>
      );
    case "exceedsBalance":
      return (
        <p role="alert" className="text-destructive text-xs">
          <Trans>Amount exceeds your balance</Trans>
        </p>
      );
    case "depositCap":
      return (
        <p role="alert" className="text-destructive text-xs">
          {notice.full ? (
            <Trans>This pool can't take any more {fromSymbol} right now.</Trans>
          ) : (
            <Trans>
              This pool can only take {depositHeadroom} more {fromSymbol} right now.
            </Trans>
          )}
        </p>
      );
    case "liquidity":
      return (
        <p role="alert" className="text-destructive text-xs">
          {notice.empty ? (
            <Trans>This pool has no {toSymbol} available to swap.</Trans>
          ) : (
            <Trans>
              This pool only has {availableOut} {toSymbol} available to swap.
            </Trans>
          )}
        </p>
      );
    case "nonPositive":
      return (
        <p role="alert" className="text-destructive text-xs">
          <Trans>Enter an amount greater than zero.</Trans>
        </p>
      );
  }
}

/**
 * The 64px amount box. `WalletAmountInput` keeps its surface, border and
 * amount type; the token picker sits inside its end edge.
 */
function AmountBox({
  id,
  label,
  amount,
  highlighted = false,
  autoFocus = false,
  invalid = false,
  picker,
  onFocus,
  onBlur,
  onAmountChange,
}: {
  id: string;
  label: string;
  amount: string;
  highlighted?: boolean;
  autoFocus?: boolean;
  invalid?: boolean;
  picker: ReactNode;
  onFocus: () => void;
  onBlur: () => void;
  onAmountChange: (amount: string) => void;
}) {
  return (
    <div role="group" aria-label={label} className="relative">
      <WalletAmountInput
        id={id}
        label={label}
        highlighted={highlighted}
        value={amount}
        // Start-aligned like the mock; the phone keeps the input's end alignment.
        style={{
          height: "4rem",
          paddingInlineEnd: "9rem",
          paddingInlineStart: "0.875rem",
          textAlign: "start",
        }}
        onValueChange={onAmountChange}
        onFocus={onFocus}
        onBlur={onBlur}
        autoFocus={autoFocus}
        aria-invalid={invalid}
      />
      <div className="absolute inset-y-0 end-3 flex items-center">{picker}</div>
    </div>
  );
}

function AmountHelp({
  lead,
  unitValue,
  max,
  symbol,
  maxDisabled,
  onMax,
}: {
  lead?: ReactNode;
  unitValue?: string;
  max?: string;
  symbol?: string;
  maxDisabled: boolean;
  onMax: () => void;
}) {
  if (!lead && !unitValue && max === undefined) return null;
  return (
    <div className="flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
      {lead ? <span className="min-w-0 truncate">{lead}</span> : null}
      {unitValue ? (
        <span dir="ltr" className="min-w-0 truncate font-mono" aria-live="polite">
          ({unitValue})
        </span>
      ) : null}
      {max !== undefined ? (
        <button
          type="button"
          disabled={maxDisabled}
          onClick={onMax}
          className="ms-auto shrink-0 font-mono font-semibold text-primary hover:underline disabled:opacity-50"
        >
          <Trans>
            Max {max} {symbol}
          </Trans>
        </button>
      ) : null}
    </div>
  );
}

function TokenPicker({
  variant,
  title,
  token,
  tokens,
  selectedId,
  isPending,
  isError,
  locale,
  open,
  onOpenChange,
  onSelect,
}: {
  variant: "from" | "to";
  title: string;
  token: WalletToken | undefined;
  tokens: PoolSwapToken[];
  selectedId?: string;
  isPending: boolean;
  isError: boolean;
  locale: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (token: PoolSwapToken) => void;
}) {
  const selectable = (entry: PoolSwapToken) =>
    variant === "from" ? entry.canSwapIn : entry.canSwapOut;
  const firstUnheldIndex = variant === "from" ? tokens.findIndex((entry) => !entry.held) : -1;
  return (
    <PopoverRoot open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button variant="outline" aria-label={title} className="max-w-32 gap-2 px-2.5">
            {token ? <TokenLogo token={token} size={20} /> : null}
            <span dir="ltr" className="min-w-0 truncate text-sm font-semibold">
              {token?.symbol ?? "—"}
            </span>
            <RiArrowDownSLine aria-hidden="true" className="text-muted-foreground" />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 p-1">
        <PopoverTitle className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">
          {title}
        </PopoverTitle>
        {isPending ? (
          <p className="px-2 py-2 text-sm text-muted-foreground">
            <Trans>Loading vouchers…</Trans>
          </p>
        ) : isError ? (
          <p role="alert" className="px-2 py-2 text-sm text-destructive">
            <Trans>Couldn't load this pool's vouchers.</Trans>
          </p>
        ) : tokens.length === 0 ? (
          <p className="px-2 py-2 text-sm text-muted-foreground">
            <Trans>This pool doesn't take any vouchers yet.</Trans>
          </p>
        ) : (
          tokens.map((entry, index) => (
            <div key={entry.id}>
              {index === firstUnheldIndex && index > 0 ? (
                <SectionHeading variant="group" as="h3" className="px-2 pt-2 pb-1">
                  <Trans>Not held</Trans>
                </SectionHeading>
              ) : null}
              <TokenRow
                token={entry}
                variant={variant}
                selected={entry.id === selectedId}
                disabled={!selectable(entry)}
                locale={locale}
                onSelect={() => onSelect(entry)}
              />
            </div>
          ))
        )}
      </PopoverContent>
    </PopoverRoot>
  );
}

function TokenRow({
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
        "flex w-full items-center gap-3 px-2 py-2 text-start hover:bg-muted/60",
        selected && "bg-muted/60",
        disabled && "opacity-45",
      )}
      onClick={onSelect}
    >
      <TokenLogo token={token.token} size={34} />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-sm">{token.token.symbol}</span>
        <span className="block truncate text-muted-foreground text-xs">{token.token.name}</span>
        <TokenReason token={token} variant={variant} />
      </span>
      <span dir="ltr" className="shrink-0 font-mono text-xs font-semibold">
        {amount}
      </span>
      {selected ? (
        <RiCheckLine className="size-5 shrink-0 text-primary" aria-hidden="true" />
      ) : null}
    </button>
  );
}

function TokenReason({ token, variant }: { token: PoolSwapToken; variant: "from" | "to" }) {
  if (token.decimals === null) {
    return (
      <span className="block text-muted-foreground text-xs">
        <Trans>Voucher details unavailable</Trans>
      </span>
    );
  }
  if (variant === "from" && token.held && token.depositHeadroomRaw === "0") {
    return (
      <span className="block text-muted-foreground text-xs">
        <Trans>
          This pool is at its credit limit for this voucher. It can take more once some is swapped
          out.
        </Trans>
      </span>
    );
  }
  if (variant === "to" && !token.canSwapOut) {
    return (
      <span className="block text-muted-foreground text-xs">
        <Trans>None left to swap for</Trans>
      </span>
    );
  }
  return null;
}
