import { formatTokenAmount, parseTokenAmount } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RiArrowDownLine, RiArrowDownSLine, RiCheckLine } from "react-icons/ri";
import { isAddress } from "viem";
import { useConnection } from "wagmi";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { SignHint, TokenLogo, type WalletToken } from "#/components/wallet";
import { BackChevron } from "#/components/wallet/wallet-kit";
import {
  type PoolSwapQuoteMode,
  usePoolSwapQuote,
} from "#/features/pools/hooks/use-pool-swap-quote";
import { usePoolSwapTokenReads } from "#/features/pools/hooks/use-pool-swap-tokens";
import { usePoolSwapTransfer } from "#/features/pools/hooks/use-pool-swap-transfer";
import { usePoolVouchersWithStatus } from "#/features/pools/hooks/use-pool-vouchers";
import { useUserPoolByAddress } from "#/features/pools/hooks/use-user-pools";
import {
  type PoolSwapToken,
  buildPoolSwapTokens,
  defaultPoolSwapFrom,
  defaultPoolSwapTo,
} from "#/features/pools/logic/pool-swap-tokens";
import { useCaliburDelegation } from "#/features/webauthn/hooks/use-calibur-delegation";
import { cn } from "#/lib/utils";

export function PoolSwapPage({ poolAddress }: { poolAddress: string }) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { address } = useConnection();
  const delegationStatus = useCaliburDelegation(address as `0x${string}` | undefined);
  const swapTransfer = usePoolSwapTransfer();
  const poolQuery = useUserPoolByAddress(poolAddress);
  const pool = poolQuery.data;
  // Drained rather than paged: a picker that stops at the first page tells a
  // holder this pool does not take their voucher, and offers nothing to correct
  // that impression with.
  const vouchersQuery = usePoolVouchersWithStatus(pool, { all: true });
  const vouchers = vouchersQuery.vouchers;
  const reads = usePoolSwapTokenReads(pool, vouchers, address);

  const [fromTokenId, setFromTokenId] = useState<string | undefined>(undefined);
  const [toTokenId, setToTokenId] = useState<string | undefined>(undefined);
  const [fromAmount, setFromAmount] = useState("");
  const [fromMaxAmountRaw, setFromMaxAmountRaw] = useState<string | null>(null);
  const [toAmount, setToAmount] = useState("");
  const [quoteMode, setQuoteMode] = useState<PoolSwapQuoteMode>("exact-input");
  const [picker, setPicker] = useState<null | { field: "from" | "to" }>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const swapTokens = useMemo(
    () => (pool ? buildPoolSwapTokens({ pool, vouchers, reads: reads.data }) : []),
    [pool, vouchers, reads.data],
  );
  const tokensPending = vouchersQuery.isPending || reads.isLoading;
  const tokensError = vouchersQuery.isError || reads.isError;

  // A default is withheld until the lists have settled. The quote fires on the
  // selected pair, so a provisional guess that moves as queries resolve spends a
  // round trip on a pair the holder never chose — and briefly shows them a rate
  // for it.
  const chosenFrom = swapTokens.find((token) => token.id === fromTokenId);
  const selectedFrom = chosenFrom ?? (tokensPending ? undefined : defaultPoolSwapFrom(swapTokens));
  const chosenTo = swapTokens.find(
    (token) => token.id === toTokenId && token.id !== selectedFrom?.id,
  );
  const selectedTo =
    chosenTo ??
    (tokensPending || !pool
      ? undefined
      : defaultPoolSwapTo(swapTokens, pool, vouchers, selectedFrom?.id));

  const sourceAmount = quoteMode === "exact-input" ? fromAmount : toAmount;
  const quote = usePoolSwapQuote({
    mode: quoteMode,
    poolAddress: pool?.address,
    limiterAddress: pool?.limiterAddress ?? undefined,
    tokenIn: selectedFrom?.token.contractAddress,
    tokenOut: selectedTo?.token.contractAddress,
    amount: sourceAmount,
    amountRawOverride: quoteMode === "exact-input" ? (fromMaxAmountRaw ?? undefined) : undefined,
    tokenInDecimals: selectedFrom?.decimals ?? 18,
    tokenOutDecimals: selectedTo?.decimals ?? 18,
  });
  const displayedFromAmount = quoteMode === "exact-input" ? fromAmount : (quote.data?.amount ?? "");
  const displayedToAmount = quoteMode === "exact-output" ? toAmount : (quote.data?.amount ?? "");
  const displayedFromAmountNumber = Number(displayedFromAmount);
  const displayedToAmountNumber = Number(displayedToAmount);
  const rate =
    Number.isFinite(displayedFromAmountNumber) &&
    displayedFromAmountNumber > 0 &&
    Number.isFinite(displayedToAmountNumber)
      ? (displayedToAmountNumber / displayedFromAmountNumber).toFixed(3)
      : "—";

  // The largest input this pool will actually settle: your balance, or the room
  // left under its deposit cap, whichever runs out first. Max above the cap hands
  // the holder an amount guaranteed to revert `LimitExceeded`.
  const fromDecimals = selectedFrom?.decimals ?? null;
  const maxFromRaw =
    selectedFrom && fromDecimals !== null
      ? smallerRawAmount(selectedFrom.balanceRaw, selectedFrom.depositHeadroomRaw)
      : null;
  const maxFromAmount =
    maxFromRaw !== null && fromDecimals !== null
      ? formatTokenAmount(maxFromRaw, fromDecimals)
      : undefined;

  let exceedsBalance = false;
  if (selectedFrom && displayedFromAmount) {
    try {
      const displayedFromAmountRaw =
        quoteMode === "exact-output" && quote.data
          ? quote.data.amountRaw
          : (fromMaxAmountRaw ??
            parseTokenAmount(displayedFromAmount, selectedFrom.decimals ?? 18));
      exceedsBalance = BigInt(displayedFromAmountRaw) > BigInt(selectedFrom.balanceRaw);
    } catch {
      exceedsBalance = false;
    }
  }
  const exceedsDepositCap = quote.data?.exceedsDepositCap === true;
  const hasSwappableFrom = swapTokens.some((token) => token.canSwapIn);
  const isValidAmount =
    !!address &&
    delegationStatus !== "checking" &&
    Number(sourceAmount) > 0 &&
    !!quote.data &&
    !quote.isDebouncing &&
    !quote.isFetching &&
    !quote.isPlaceholderData &&
    quote.data.hasLiquidity &&
    !exceedsBalance &&
    !exceedsDepositCap;
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

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <BackChevron label={t`Pool`} to={detailFallback} />

      <h1 className="font-heading mb-3.5 text-[1.75rem] font-bold leading-tight">
        <Trans>Swap</Trans>
      </h1>

      <div className="relative grid grid-rows-2 gap-1">
        <SwapField
          label={t`From`}
          token={selectedFrom?.token}
          amount={displayedFromAmount}
          max={maxFromAmount}
          invalid={exceedsBalance || exceedsDepositCap}
          onAmountChange={(amount) => {
            setQuoteMode("exact-input");
            setFromMaxAmountRaw(null);
            setFromAmount(amount);
          }}
          onMax={() => {
            if (!maxFromAmount || maxFromRaw === null) return;
            setQuoteMode("exact-input");
            setFromMaxAmountRaw(maxFromRaw);
            setFromAmount(maxFromAmount);
          }}
          onSelect={() => setPicker({ field: "from" })}
        />
        <SwapField
          label={t`To`}
          token={selectedTo?.token}
          amount={displayedToAmount}
          onAmountChange={(amount) => {
            setQuoteMode("exact-output");
            setFromMaxAmountRaw(null);
            setToAmount(amount);
          }}
          onSelect={() => setPicker({ field: "to" })}
        />
        <button
          type="button"
          aria-label={t`Reverse swap direction`}
          // Reversing is only offered where the reversed pair is itself swappable
          // — the To voucher has to be one you hold, and the From one the pool can
          // pay out.
          disabled={!selectedFrom?.canSwapOut || !selectedTo?.canSwapIn}
          onClick={() => {
            if (!selectedFrom || !selectedTo) return;
            setFromMaxAmountRaw(null);
            setFromTokenId(selectedTo.id);
            setToTokenId(selectedFrom.id);
          }}
          className="absolute top-1/2 left-1/2 z-10 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-background bg-foreground text-background disabled:opacity-50"
        >
          <RiArrowDownLine className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-muted-foreground text-xs">
            <Trans>Rate</Trans>
          </span>
          <span className="font-mono text-xs font-semibold">
            1 {selectedFrom?.token.symbol ?? "—"} = {rate} {selectedTo?.token.symbol ?? "—"}
          </span>
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-muted-foreground text-xs">
            <Trans>Fees</Trans>
          </span>
          <span className="font-mono text-xs font-semibold">
            <Trans>Fee calculated at confirmation</Trans>
          </span>
        </div>
      </div>

      {tokensPending ? (
        <p className="mt-2 text-muted-foreground text-xs">
          <Trans>Checking which vouchers this pool takes…</Trans>
        </p>
      ) : tokensError ? (
        <div className="mt-2 space-y-2">
          <p role="alert" className="text-destructive text-xs">
            <Trans>Couldn't check which vouchers this pool takes.</Trans>
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-9 bg-card"
            onClick={() => {
              void vouchersQuery.refetch();
              void reads.refetch();
            }}
          >
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : swapTokens.length === 0 ? (
        <p role="alert" className="mt-2 text-muted-foreground text-xs">
          <Trans>This pool doesn't take any vouchers yet.</Trans>
        </p>
      ) : !hasSwappableFrom ? (
        <p role="alert" className="mt-2 text-muted-foreground text-xs">
          <Trans>You don't hold any voucher this pool takes.</Trans>
        </p>
      ) : quote.isError && !quote.isDebouncing ? (
        <p
          role="alert"
          aria-label={t`Couldn't estimate this swap.`}
          className="mt-2 text-destructive text-xs"
        >
          <Trans>Couldn't estimate this swap.</Trans>
        </p>
      ) : exceedsBalance ? (
        <p role="alert" className="mt-2 text-destructive text-xs">
          <Trans>Amount exceeds your balance</Trans>
        </p>
      ) : exceedsDepositCap ? (
        <p role="alert" className="mt-2 text-destructive text-xs">
          {quote.data?.depositHeadroom === "0.00" ? (
            <Trans>This pool can't take any more {selectedFrom?.token.symbol} right now.</Trans>
          ) : (
            <Trans>
              This pool can only take {quote.data?.depositHeadroom} more{" "}
              {selectedFrom?.token.symbol} right now.
            </Trans>
          )}
        </p>
      ) : quote.data &&
        !quote.isDebouncing &&
        !quote.isPlaceholderData &&
        !quote.data.hasLiquidity ? (
        <p role="alert" className="mt-2 text-destructive text-xs">
          {BigInt(quote.data.availableAmountOutRaw) === 0n ? (
            <Trans>This pool has no {selectedTo?.token.symbol} available to swap.</Trans>
          ) : (
            <Trans>
              This pool only has {quote.data.availableAmountOut} {selectedTo?.token.symbol}{" "}
              available to swap.
            </Trans>
          )}
        </p>
      ) : sourceAmount.trim() !== "" && Number(sourceAmount) <= 0 ? (
        <p role="alert" className="mt-2 text-destructive text-xs">
          <Trans>Enter an amount greater than zero.</Trans>
        </p>
      ) : null}

      <div className="flex-1" />

      <SignHint className="mb-2.5 bg-card" />
      <Button
        className="h-11 w-full"
        disabled={!isValidAmount || !selectedFrom || !selectedTo}
        onClick={() => {
          if (!selectedFrom || !selectedTo || !isValidAmount) return;
          setConfirmError(null);
          setConfirmOpen(true);
        }}
      >
        <Trans>Swap</Trans>
      </Button>

      <PoolTokenPickerSheet
        open={picker?.field === "from"}
        onOpenChange={(open) => {
          if (!open) setPicker(null);
        }}
        variant="from"
        title={t`From`}
        tokens={swapTokens}
        selectedId={selectedFrom?.id}
        isPending={tokensPending}
        isError={tokensError}
        onSelect={(token) => {
          setFromMaxAmountRaw(null);
          if (token.id === selectedTo?.id) setToTokenId(selectedFrom?.id);
          setFromTokenId(token.id);
        }}
      />
      <PoolTokenPickerSheet
        open={picker?.field === "to"}
        onOpenChange={(open) => {
          if (!open) setPicker(null);
        }}
        variant="to"
        title={t`To`}
        tokens={swapTokens.filter((token) => token.id !== selectedFrom?.id)}
        selectedId={selectedTo?.id}
        isPending={tokensPending}
        isError={tokensError}
        onSelect={(token) => setToTokenId(token.id)}
      />
      <SwapConfirmationSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        fromAmount={displayedFromAmount}
        fromSymbol={selectedFrom?.token.symbol ?? ""}
        toAmount={displayedToAmount}
        toSymbol={selectedTo?.token.symbol ?? ""}
        poolName={pool.name}
        error={
          confirmError ?? (swapTransfer.error instanceof Error ? swapTransfer.error.message : null)
        }
        isPending={swapTransfer.isPending}
        onConfirm={async () => {
          if (!address || !selectedFrom || !selectedTo || !quote.data || !isValidAmount) return;
          setConfirmError(null);
          const previousQuoteRaw = quote.data.amountRaw;
          const refreshed = await quote.refetch();
          if (refreshed.isError || !refreshed.data) {
            setConfirmError(t`Couldn't verify this swap. Try again.`);
            return;
          }
          if (!refreshed.data.hasLiquidity) {
            setConfirmError(t`Pool liquidity changed. Review the updated quote and try again.`);
            return;
          }
          if (refreshed.data.exceedsDepositCap) {
            setConfirmError(
              t`This pool's deposit limit changed. Review the updated amounts and try again.`,
            );
            return;
          }
          if (refreshed.data.amountRaw !== previousQuoteRaw) {
            setConfirmError(t`The quote changed. Review the updated amounts before confirming.`);
            return;
          }
          const tokenIn = selectedFrom.token.contractAddress;
          const tokenOut = selectedTo.token.contractAddress;
          if (
            !isAddress(pool.address) ||
            !tokenIn ||
            !isAddress(tokenIn) ||
            !tokenOut ||
            !isAddress(tokenOut)
          ) {
            setConfirmError(t`Couldn't verify this swap. Try again.`);
            return;
          }
          const result = await swapTransfer
            .mutateAsync({
              mode: quoteMode,
              senderAddress: address,
              path: [{ poolAddress: pool.address, tokenIn, tokenOut }],
              hopAmountIns: [refreshed.data.amountInRaw],
              includeAuthorization: delegationStatus === "not-delegated",
            })
            .catch(() => null);
          if (!result) return;
          void navigate({
            to: "/pools/$poolAddress/swap/receipt",
            params: { poolAddress },
            search: {
              trackingId: result.trackingId,
              sendAmount: displayedFromAmount,
              sendSymbol: selectedFrom.token.symbol,
              receiveAmount: displayedToAmount,
              receiveSymbol: selectedTo.token.symbol,
              receiveToken: tokenOut,
              poolName: pool.name,
            },
          });
        }}
      />
    </div>
  );
}

function SwapConfirmationSheet({
  open,
  onOpenChange,
  fromAmount,
  fromSymbol,
  toAmount,
  toSymbol,
  poolName,
  error,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fromAmount: string;
  fromSymbol: string;
  toAmount: string;
  toSymbol: string;
  poolName: string;
  error: string | null;
  isPending: boolean;
  onConfirm: () => Promise<void>;
}) {
  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="rounded-none border-t border-border bg-background shadow-none [&>div:first-child]:hidden">
          <SheetHeader className="px-6 pt-5 pb-3">
            <SheetTitle className="font-heading text-[1.375rem] font-semibold tracking-tight">
              <Trans>Confirm swap</Trans>
            </SheetTitle>
          </SheetHeader>
          <div className="px-6 pb-2">
            <div className="border border-border bg-card">
              <SwapConfirmationRow label={<Trans>From</Trans>}>
                {fromAmount} {fromSymbol}
              </SwapConfirmationRow>
              <SwapConfirmationRow label={<Trans>To</Trans>}>
                {toAmount} {toSymbol}
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
            <Button className="h-11 w-full" disabled={isPending} onClick={() => void onConfirm()}>
              {isPending ? <Trans>Swapping…</Trans> : <Trans>Confirm swap</Trans>}
            </Button>
            <Button
              variant="ghost"
              className="h-11 w-full"
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
      <span className="min-w-0 break-words text-right font-mono text-xs font-semibold">
        {children}
      </span>
    </div>
  );
}

function SwapField({
  label,
  token,
  amount,
  max,
  invalid = false,
  onAmountChange,
  onMax,
  onSelect,
}: {
  label: string;
  token: WalletToken | undefined;
  amount: string;
  max?: string;
  invalid?: boolean;
  onAmountChange: (amount: string) => void;
  onMax?: () => void;
  onSelect: () => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="grid h-full min-h-28 grid-rows-[1.75rem_1fr] border border-border bg-card p-3.5"
    >
      <div className="flex items-start justify-between">
        <span className="text-muted-foreground text-xs">{label}</span>
        {max !== undefined ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onMax}
            className="font-mono text-[0.6875rem] font-semibold"
          >
            <Trans>Max {max}</Trans>
          </Button>
        ) : null}
      </div>
      <div className="grid grid-cols-[7.25rem_minmax(0,1fr)] items-center gap-2.5">
        <button
          type="button"
          onClick={onSelect}
          className="flex h-9 min-w-0 items-center gap-1.5 border border-border bg-card px-2"
        >
          {token ? (
            <TokenLogo token={token} size={24} />
          ) : (
            <span className="size-6 shrink-0 rounded-full bg-muted" />
          )}
          <span className="min-w-0 flex-1 truncate text-left text-sm font-bold">
            {token?.symbol ?? "—"}
          </span>
          <RiArrowDownSLine className="size-4 text-muted-foreground" aria-hidden="true" />
        </button>
        <Input
          value={amount}
          onChange={(event) => onAmountChange(sanitizeAmount(event.target.value))}
          inputMode="decimal"
          aria-label={label}
          aria-invalid={invalid}
          className="h-9 w-full truncate border-0 bg-card px-0 text-right font-heading text-[1.625rem] font-semibold leading-none tracking-tight shadow-none focus-visible:border-0"
        />
      </div>
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
        <SheetContent className="rounded-none border-t border-border shadow-none [&>div:first-child]:hidden">
          <SheetHeader className="px-6 pt-5 pb-3">
            <SheetTitle className="font-heading text-[1.375rem] font-semibold tracking-tight">
              {title}
            </SheetTitle>
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
                    <p className="px-4 pt-3 pb-1 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground">
                      <Trans>Not held</Trans>
                    </p>
                  ) : null}
                  <PoolTokenPickerRow
                    token={token}
                    variant={variant}
                    selected={token.id === selectedId}
                    disabled={!selectable(token)}
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
  onSelect,
}: {
  token: PoolSwapToken;
  variant: "from" | "to";
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const amountRaw = variant === "from" ? token.balanceRaw : token.liquidityRaw;
  const amount = token.decimals === null ? "—" : formatTokenAmount(amountRaw, token.decimals);

  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3 text-left active:bg-muted",
        selected && "bg-muted/60",
        disabled && "opacity-45",
      )}
      onClick={onSelect}
    >
      <TokenLogo token={token.token} size={34} />
      <div className="min-w-0 flex-1">
        <p className="font-heading font-semibold text-sm tracking-tight">{token.token.symbol}</p>
        <p className="truncate text-muted-foreground text-xs">{token.token.name}</p>
        <PoolTokenPickerReason token={token} variant={variant} />
      </div>
      <span className="shrink-0 font-mono text-xs font-semibold">{amount}</span>
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
      <p className="text-[0.6875rem] text-muted-foreground">
        <Trans>Voucher details unavailable</Trans>
      </p>
    );
  }
  if (variant === "from" && token.held && token.depositHeadroomRaw === "0") {
    return (
      <p className="text-[0.6875rem] text-muted-foreground">
        <Trans>This pool is full of it</Trans>
      </p>
    );
  }
  if (variant === "to" && !token.canSwapOut) {
    return (
      <p className="text-[0.6875rem] text-muted-foreground">
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

/** The binding constraint of the two, where both are known. */
function smallerRawAmount(balanceRaw: string, headroomRaw: string | null): string | null {
  try {
    const balance = BigInt(balanceRaw);
    if (headroomRaw === null) return balance.toString();
    const headroom = BigInt(headroomRaw);
    return (balance < headroom ? balance : headroom).toString();
  } catch {
    return null;
  }
}

function sanitizeAmount(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  const whole = cleaned.slice(0, firstDot);
  const fraction = cleaned
    .slice(firstDot + 1)
    .replace(/\./g, "")
    .slice(0, 2);
  return `${whole}.${fraction}`;
}
