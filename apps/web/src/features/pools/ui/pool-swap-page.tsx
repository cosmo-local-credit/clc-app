import { parseTokenAmount } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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
import { usePoolSwapTransfer } from "#/features/pools/hooks/use-pool-swap-transfer";
import { usePoolVoucherTokens } from "#/features/pools/hooks/use-pool-voucher-tokens";
import { usePoolVouchers } from "#/features/pools/hooks/use-pool-vouchers";
import { useUserPoolByAddress } from "#/features/pools/hooks/use-user-pools";
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
  const vouchers = usePoolVouchers(pool);
  const tokens = usePoolVoucherTokens(vouchers);

  const [fromTokenId, setFromTokenId] = useState<string | undefined>(undefined);
  const [toTokenId, setToTokenId] = useState<string | undefined>(undefined);
  const [fromAmount, setFromAmount] = useState("25.00");
  const [fromMaxAmountRaw, setFromMaxAmountRaw] = useState<string | null>(null);
  const [toAmount, setToAmount] = useState("");
  const [quoteMode, setQuoteMode] = useState<PoolSwapQuoteMode>("exact-input");
  const [picker, setPicker] = useState<null | { field: "from" | "to" }>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const selectedFrom = tokens.find((token) => token.id === fromTokenId) ?? tokens[0];
  const selectedTo =
    tokens.find((token) => token.id === toTokenId && token.id !== selectedFrom?.id) ??
    tokens.find((token) => token.id !== selectedFrom?.id);
  const sourceAmount = quoteMode === "exact-input" ? fromAmount : toAmount;
  const quote = usePoolSwapQuote({
    mode: quoteMode,
    poolAddress: pool?.address,
    tokenIn: selectedFrom?.contractAddress,
    tokenOut: selectedTo?.contractAddress,
    amount: sourceAmount,
    amountRawOverride: quoteMode === "exact-input" ? (fromMaxAmountRaw ?? undefined) : undefined,
    tokenInDecimals: selectedFrom?.tokenDecimals ?? 18,
    tokenOutDecimals: selectedTo?.tokenDecimals ?? 18,
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
  let exceedsBalance = false;
  if (selectedFrom?.balance && displayedFromAmount) {
    try {
      const displayedFromAmountRaw =
        quoteMode === "exact-output" && quote.data
          ? quote.data.amountRaw
          : (fromMaxAmountRaw ??
            parseTokenAmount(displayedFromAmount, selectedFrom.tokenDecimals ?? 18));
      exceedsBalance = BigInt(displayedFromAmountRaw) > BigInt(selectedFrom.balance);
    } catch {
      exceedsBalance = false;
    }
  }
  const isValidAmount =
    !!address &&
    delegationStatus !== "checking" &&
    Number(sourceAmount) > 0 &&
    !!quote.data &&
    !quote.isDebouncing &&
    !quote.isFetching &&
    !quote.isPlaceholderData &&
    quote.data.hasLiquidity &&
    !exceedsBalance;
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
          token={selectedFrom}
          amount={displayedFromAmount}
          max={selectedFrom?.amount}
          invalid={exceedsBalance}
          onAmountChange={(amount) => {
            setQuoteMode("exact-input");
            setFromMaxAmountRaw(null);
            setFromAmount(amount);
          }}
          onMax={() => {
            if (!selectedFrom) return;
            setQuoteMode("exact-input");
            setFromMaxAmountRaw(selectedFrom.balance ?? null);
            setFromAmount(selectedFrom.amount);
          }}
          onSelect={() => setPicker({ field: "from" })}
        />
        <SwapField
          label={t`To`}
          token={selectedTo}
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
          disabled={!selectedFrom || !selectedTo}
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
            1 {selectedFrom?.symbol ?? "—"} = {rate} {selectedTo?.symbol ?? "—"}
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

      {quote.isError && !quote.isDebouncing ? (
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
      ) : quote.data &&
        !quote.isDebouncing &&
        !quote.isPlaceholderData &&
        !quote.data.hasLiquidity ? (
        <p role="alert" className="mt-2 text-destructive text-xs">
          {BigInt(quote.data.availableAmountOutRaw) === 0n ? (
            <Trans>This pool has no {selectedTo?.symbol} available to swap.</Trans>
          ) : (
            <Trans>
              This pool only has {quote.data.availableAmountOut} {selectedTo?.symbol} available to
              swap.
            </Trans>
          )}
        </p>
      ) : Number(sourceAmount) <= 0 ? (
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
        title={t`From`}
        tokens={tokens}
        selectedId={selectedFrom?.id}
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
        title={t`To`}
        tokens={tokens}
        selectedId={selectedTo?.id}
        onSelect={(token) => {
          if (token.id === selectedFrom?.id) {
            setFromMaxAmountRaw(null);
            setFromTokenId(selectedTo?.id);
          }
          setToTokenId(token.id);
        }}
      />
      <SwapConfirmationSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        fromAmount={displayedFromAmount}
        fromSymbol={selectedFrom?.symbol ?? ""}
        toAmount={displayedToAmount}
        toSymbol={selectedTo?.symbol ?? ""}
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
          if (refreshed.data.amountRaw !== previousQuoteRaw) {
            setConfirmError(t`The quote changed. Review the updated amounts before confirming.`);
            return;
          }
          if (
            !isAddress(pool.address) ||
            !selectedFrom.contractAddress ||
            !isAddress(selectedFrom.contractAddress) ||
            !selectedTo.contractAddress ||
            !isAddress(selectedTo.contractAddress)
          ) {
            setConfirmError(t`Couldn't verify this swap. Try again.`);
            return;
          }
          const result = await swapTransfer
            .mutateAsync({
              mode: quoteMode,
              senderAddress: address,
              path: [
                {
                  poolAddress: pool.address,
                  tokenIn: selectedFrom.contractAddress,
                  tokenOut: selectedTo.contractAddress,
                },
              ],
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
              sendSymbol: selectedFrom.symbol,
              receiveAmount: displayedToAmount,
              receiveSymbol: selectedTo.symbol,
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

function PoolTokenPickerSheet({
  open,
  onOpenChange,
  title,
  tokens,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  tokens: WalletToken[];
  selectedId?: string;
  onSelect: (token: WalletToken) => void;
}) {
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
            {tokens.length === 0 ? (
              <p className="px-4 py-3 text-muted-foreground text-sm">
                <Trans>No tokens available.</Trans>
              </p>
            ) : (
              tokens.map((token) => {
                const selected = token.id === selectedId;
                return (
                  <button
                    key={token.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left active:bg-muted",
                      selected && "bg-muted/60",
                    )}
                    onClick={() => {
                      onSelect(token);
                      onOpenChange(false);
                    }}
                  >
                    <TokenLogo token={token} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="font-heading font-semibold text-sm tracking-tight">
                        {token.symbol}
                      </p>
                      <p className="truncate text-muted-foreground text-xs">{token.name}</p>
                    </div>
                    <span className="shrink-0 font-mono text-xs font-semibold">{token.amount}</span>
                    {selected ? (
                      <RiCheckLine className="size-5 shrink-0 text-primary" aria-hidden="true" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
          <SheetFooter className="px-6 pb-[max(1rem,env(safe-area-inset-bottom))]" />
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
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
