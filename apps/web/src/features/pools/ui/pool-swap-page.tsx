import type { PoolSwapFeeBreakdownRaw } from "@clc/core/features/pool-swaps/logic";
import {
  formatUnitOfAccountDisplayValue,
  formatVoucherUnitValue,
} from "@clc/core/features/market/logic";
import {
  formatTokenAmount,
  formatTokenAmountFixed,
  parseTokenAmount,
} from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RiArrowDownSLine, RiCheckLine } from "react-icons/ri";
import { isAddress } from "viem";
import { useConnection } from "wagmi";

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
import { TokenLogo, type WalletToken, WalletAmountInput } from "#/components/wallet";
import { BackChevron } from "#/components/wallet/wallet-kit";
import {
  type PoolSwapQuoteMode,
  usePoolSwapQuote,
} from "#/features/pools/hooks/use-pool-swap-quote";
import { usePoolSwapMaximum } from "#/features/pools/hooks/use-pool-swap-maximum";
import { usePoolSwapTokenReads } from "#/features/pools/hooks/use-pool-swap-tokens";
import { usePoolSwapTransfer } from "#/features/pools/hooks/use-pool-swap-transfer";
import { usePoolSwapVouchers } from "#/features/pools/hooks/use-pool-swap-vouchers";
import { useUserPoolByAddress } from "#/features/pools/hooks/use-user-pools";
import {
  type PoolSwapToken,
  buildPoolSwapTokens,
  defaultPoolSwapFrom,
  defaultPoolSwapTo,
} from "#/features/pools/logic/pool-swap-tokens";
import { useCaliburDelegation } from "#/features/webauthn/hooks/use-calibur-delegation";
import { relaySnapshotUnitValue } from "#/features/wallet/logic/relay-valuation";
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
  const { i18n, t } = useLingui();
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const receiveLabel = t`You receive`;
  const sendLabel = t`You send`;
  const navigate = useNavigate();
  const { address } = useConnection();
  const delegationStatus = useCaliburDelegation(address as `0x${string}` | undefined);
  const swapTransfer = usePoolSwapTransfer();
  const poolQuery = useUserPoolByAddress(poolAddress);
  const pool = poolQuery.data;
  // The pool's registry decides the menu, not the catalog. A picker built from the
  // catalog's projection omits members it has not indexed, and tells a holder this
  // pool does not take a voucher it does.
  const vouchersQuery = usePoolSwapVouchers(pool);
  const vouchers = vouchersQuery.vouchers;
  const reads = usePoolSwapTokenReads(pool, vouchers, address);

  const [fromTokenId, setFromTokenId] = useState<string | undefined>(undefined);
  const [toTokenId, setToTokenId] = useState<string | undefined>(
    receiveTokenAddress?.toLowerCase(),
  );
  const [fromAmount, setFromAmount] = useState("");
  const [fromMaxAmountRaw, setFromMaxAmountRaw] = useState<string | null>(null);
  const [toAmount, setToAmount] = useState("");
  const [quoteMode, setQuoteMode] = useState<PoolSwapQuoteMode>("exact-output");
  const [focusedField, setFocusedField] = useState<"from" | "to" | null>(null);
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
  // The default keeps off the voucher the holder arrived wanting, not whatever
  // is selected on the other side now: keyed off the live selection, choosing a
  // different receive voucher would hand the send side back to that default.
  const selectedFrom =
    chosenFrom ??
    (tokensPending
      ? undefined
      : defaultPoolSwapFrom(swapTokens, receiveTokenAddress?.toLowerCase()));
  const chosenTo = swapTokens.find(
    (token) => token.id === toTokenId && token.id !== selectedFrom?.id,
  );
  const selectedTo =
    chosenTo ??
    (tokensPending || !pool
      ? undefined
      : defaultPoolSwapTo(swapTokens, pool, vouchers, selectedFrom?.id));

  const maximum = usePoolSwapMaximum({
    poolAddress: pool?.address,
    quoterAddress: pool?.quoterAddress,
    tokenIn: selectedFrom?.token.contractAddress,
    tokenOut: selectedTo?.token.contractAddress,
    walletBalanceRaw: selectedFrom?.balanceRaw,
    // Null is genuinely uncapped. An unrecorded limiter value is unknown, so
    // Max stays hidden rather than pretending the wallet balance will settle.
    depositHeadroomRaw:
      selectedFrom?.cap.kind === "unrecorded" ? undefined : selectedFrom?.depositHeadroomRaw,
    availableAmountOutRaw: selectedTo?.liquidityRaw,
    blockNumber: reads.blockNumber,
  });

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
  const fromDecimals = selectedFrom?.decimals ?? null;
  const toDecimals = selectedTo?.decimals ?? null;
  const quoteFromAmount =
    quote.data && fromDecimals !== null
      ? formatTokenAmountFixed(quote.data.amountInRaw, fromDecimals, 2)
      : "";
  const quoteToAmount =
    quote.data && toDecimals !== null
      ? formatTokenAmountFixed(quote.data.amountOutRaw, toDecimals, 2)
      : "";
  const localizedQuoteFromAmount =
    quote.data && fromDecimals !== null
      ? formatTokenAmountFixed(quote.data.amountInRaw, fromDecimals, 2, locale)
      : "";
  const localizedQuoteToAmount =
    quote.data && toDecimals !== null
      ? formatTokenAmountFixed(quote.data.amountOutRaw, toDecimals, 2, locale)
      : "";
  const editableFromAmount = quoteMode === "exact-input" ? fromAmount : quoteFromAmount;
  const editableToAmount = quoteMode === "exact-output" ? toAmount : quoteToAmount;
  const settledFromAmount =
    quoteMode === "exact-input"
      ? fixedEnteredAmount(fromAmount, fromDecimals, locale)
      : localizedQuoteFromAmount;
  const settledToAmount =
    quoteMode === "exact-output"
      ? fixedEnteredAmount(toAmount, toDecimals, locale)
      : localizedQuoteToAmount;
  const displayedFromAmount = focusedField === "from" ? editableFromAmount : settledFromAmount;
  const displayedToAmount = focusedField === "to" ? editableToAmount : settledToAmount;
  const exactFromAmount =
    quote.data && !quote.isPlaceholderData && fromDecimals !== null
      ? formatTokenAmount(quote.data.amountInRaw, fromDecimals, fromDecimals)
      : quoteMode === "exact-input"
        ? canonicalEnteredAmount(fromAmount, fromDecimals)
        : null;
  const exactToAmount =
    quote.data && !quote.isPlaceholderData && toDecimals !== null
      ? formatTokenAmount(quote.data.amountOutRaw, toDecimals, toDecimals)
      : quoteMode === "exact-output"
        ? canonicalEnteredAmount(toAmount, toDecimals)
        : null;
  const fromUnitValue = swapUnitValue(selectedFrom, exactFromAmount, locale);
  const toUnitValue = swapUnitValue(selectedTo, exactToAmount, locale);

  let rate = "—";
  if (quote.data && fromDecimals !== null && toDecimals !== null) {
    const amountInRaw = BigInt(quote.data.amountInRaw);
    if (amountInRaw > 0n) {
      const rateRaw =
        (BigInt(quote.data.amountOutRaw) * 10n ** BigInt(fromDecimals) * 100n) /
        (amountInRaw * 10n ** BigInt(toDecimals));
      rate = formatTokenAmountFixed(rateRaw.toString(), 2, 2, locale);
    }
  }

  // The pair-specific maximum combines the holder balance, the input deposit
  // headroom, and output liquidity converted through the pool's gross quoter.
  // Fees come out of the output leg, so they lower what arrives, not what may be
  // sent. Until that boundary is known for this pair no fallback Max is shown; a
  // refresh keeps the last answer for the same pair rather than blinking it out.
  const maximumRaw = maximum.data?.maxAmountInRaw;
  const maxFromRaw =
    maximumRaw !== undefined && isPositiveRawAmount(maximumRaw) ? maximumRaw : null;
  const maxReceiveRaw = maximum.data?.maxAmountOutRaw;
  const maxReceiveAmount =
    maxReceiveRaw && toDecimals !== null && isPositiveRawAmount(maxReceiveRaw)
      ? formatTokenAmountFixed(maxReceiveRaw, toDecimals, 2, locale)
      : null;
  const receiveSymbol = selectedTo?.token.symbol ?? "";
  const displayedFeeBreakdown =
    quote.isError || quote.isPlaceholderData ? null : (quote.data?.feeBreakdown ?? null);
  const feesPending = quote.isFetching && !displayedFeeBreakdown;
  const maxFromAmount =
    maxFromRaw !== null && fromDecimals !== null
      ? formatTokenAmountFixed(maxFromRaw, fromDecimals, 2)
      : undefined;
  // A lent answer from the previous block may be showing. It is fine to read, but
  // not to spend: the pin outlives the refresh, so a balance, cap or liquidity
  // that has since fallen would leave it above what the swap can carry.
  const maxSettled = !maximum.isPlaceholderData;
  // Max on either side is the same request: spend the pinned raw maximum.
  // Filling the receive side by typing its figure back in would round the send
  // side up by a wei and could overrun the balance.
  const applyMax = () => {
    if (!maxSettled || !maxFromAmount || maxFromRaw === null) return;
    setQuoteMode("exact-input");
    setFromMaxAmountRaw(maxFromRaw);
    setFromAmount(maxFromAmount);
  };

  const localizedMaxFromAmount =
    maxFromRaw !== null && fromDecimals !== null
      ? formatTokenAmountFixed(maxFromRaw, fromDecimals, 2, locale)
      : undefined;

  let exceedsBalance = false;
  if (selectedFrom && editableFromAmount) {
    try {
      const displayedFromAmountRaw =
        quoteMode === "exact-output" && quote.data
          ? quote.data.amountInRaw
          : (fromMaxAmountRaw ?? parseTokenAmount(fromAmount, selectedFrom.decimals ?? 18));
      exceedsBalance = BigInt(displayedFromAmountRaw) > BigInt(selectedFrom.balanceRaw);
    } catch {
      exceedsBalance = false;
    }
  }
  const exceedsDepositCap = quote.data?.exceedsDepositCap === true;
  const localizedAmounts = {
    depositHeadroom:
      quote.data?.depositHeadroomRaw !== null &&
      quote.data?.depositHeadroomRaw !== undefined &&
      fromDecimals !== null
        ? formatTokenAmountFixed(quote.data.depositHeadroomRaw, fromDecimals, 2, locale)
        : null,
    availableAmountOut:
      quote.data && toDecimals !== null
        ? formatTokenAmountFixed(quote.data.availableAmountOutRaw, toDecimals, 2, locale)
        : null,
  };
  const hasSwappableFrom = swapTokens.some((token) => token.canSwapIn);
  const isValidAmount =
    !!address &&
    delegationStatus !== "checking" &&
    Number(sourceAmount) > 0 &&
    !!quote.data &&
    !quote.isError &&
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

      <div className="mt-1 space-y-2">
        <SwapField
          id="swap-receive-amount"
          highlighted
          label={receiveLabel}
          token={selectedTo?.token}
          amount={displayedToAmount}
          unitValue={exactToAmount ? (toUnitValue ?? t`Unavailable`) : undefined}
          autoFocus
          max={maxReceiveAmount ?? undefined}
          actionsDisabled={!maxSettled}
          onFocus={() => setFocusedField("to")}
          onBlur={() => {
            if (quoteMode === "exact-output") {
              setToAmount(fixedEnteredAmount(toAmount, toDecimals));
            }
            setFocusedField((current) => (current === "to" ? null : current));
          }}
          onAmountChange={(amount) => {
            setQuoteMode("exact-output");
            setFromMaxAmountRaw(null);
            setToAmount(amount);
          }}
          onMax={applyMax}
          onSelect={() => setPicker({ field: "to" })}
        />
        <SwapField
          id="swap-send-amount"
          label={sendLabel}
          token={selectedFrom?.token}
          amount={displayedFromAmount}
          unitValue={exactFromAmount ? (fromUnitValue ?? t`Unavailable`) : undefined}
          max={localizedMaxFromAmount}
          actionsDisabled={!maxSettled}
          invalid={exceedsBalance || exceedsDepositCap}
          onFocus={() => setFocusedField("from")}
          onBlur={() => {
            if (quoteMode === "exact-input") {
              setFromAmount(fixedEnteredAmount(fromAmount, fromDecimals));
            }
            setFocusedField((current) => (current === "from" ? null : current));
          }}
          onAmountChange={(amount) => {
            setQuoteMode("exact-input");
            setFromMaxAmountRaw(null);
            setFromAmount(amount);
          }}
          onMax={applyMax}
          onSelect={() => setPicker({ field: "from" })}
        />
      </div>

      <div className="mt-3 border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-muted-foreground text-xs">
            <Trans>Rate</Trans>
          </span>
          <span dir="ltr" className="font-mono text-xs font-semibold">
            1 {selectedFrom?.token.symbol ?? "—"} = {rate} {selectedTo?.token.symbol ?? "—"}
          </span>
        </div>
        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2">
          <span className="text-muted-foreground text-xs">
            <Trans>Pool fee</Trans>
          </span>
          <PoolSwapFeeValue
            breakdown={displayedFeeBreakdown}
            part="pool"
            decimals={toDecimals}
            symbol={receiveSymbol}
            locale={locale}
            pending={feesPending}
          />
        </div>
        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2">
          <span className="text-muted-foreground text-xs">
            <Trans>Protocol fee</Trans>
          </span>
          <PoolSwapFeeValue
            breakdown={displayedFeeBreakdown}
            part="protocol"
            decimals={toDecimals}
            symbol={receiveSymbol}
            locale={locale}
            pending={feesPending}
          />
        </div>
        <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2">
          <span className="text-muted-foreground text-xs">
            <Trans>Total fees</Trans>
          </span>
          <PoolSwapFeeValue
            breakdown={displayedFeeBreakdown}
            part="total"
            decimals={toDecimals}
            symbol={receiveSymbol}
            locale={locale}
            pending={feesPending}
          />
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
            tap
            onClick={() => {
              vouchersQuery.refetch();
              void reads.refetch();
            }}
            pending={vouchersQuery.isFetching || reads.isFetching}
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
        <div className="mt-2 flex items-center justify-between gap-3">
          <p
            role="alert"
            aria-label={t`Couldn't estimate this swap.`}
            className="text-destructive text-xs"
          >
            <Trans>Couldn't estimate this swap.</Trans>
          </p>
          <Button
            variant="outline"
            tap
            pending={quote.isFetching}
            onClick={() => void quote.refetch()}
          >
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : exceedsBalance ? (
        <p role="alert" className="mt-2 text-destructive text-xs">
          <Trans>Amount exceeds your balance</Trans>
        </p>
      ) : exceedsDepositCap ? (
        <p role="alert" className="mt-2 text-destructive text-xs">
          {quote.data?.depositHeadroomRaw === "0" ? (
            <Trans>This pool can't take any more {selectedFrom?.token.symbol} right now.</Trans>
          ) : (
            <Trans>
              This pool can only take {localizedAmounts.depositHeadroom} more{" "}
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
              This pool only has {localizedAmounts.availableAmountOut} {selectedTo?.token.symbol}{" "}
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

      <Button
        size="lg"
        className="w-full"
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
        title={sendLabel}
        tokens={swapTokens}
        selectedId={selectedFrom?.id}
        isPending={tokensPending}
        isError={tokensError}
        locale={locale}
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
        title={receiveLabel}
        tokens={swapTokens.filter((token) => token.id !== selectedFrom?.id)}
        selectedId={selectedTo?.id}
        isPending={tokensPending}
        isError={tokensError}
        locale={locale}
        onSelect={(token) => setToTokenId(token.id)}
      />
      <SwapConfirmationSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        fromAmount={localizedQuoteFromAmount}
        fromSymbol={selectedFrom?.token.symbol ?? ""}
        fromUnitValue={exactFromAmount ? (fromUnitValue ?? t`Unavailable`) : null}
        toAmount={localizedQuoteToAmount}
        toSymbol={selectedTo?.token.symbol ?? ""}
        toUnitValue={exactToAmount ? (toUnitValue ?? t`Unavailable`) : null}
        feeBreakdown={quote.data?.feeBreakdown ?? null}
        feeDecimals={toDecimals}
        locale={locale}
        poolName={pool.name}
        error={
          confirmError ?? (swapTransfer.error instanceof Error ? swapTransfer.error.message : null)
        }
        isPending={swapTransfer.isPending}
        onConfirm={async () => {
          if (!address || !selectedFrom || !selectedTo || !quote.data || !isValidAmount) return;
          setConfirmError(null);
          const previousQuoteFingerprint = quoteFingerprint(quote.data);
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
          if (quoteFingerprint(refreshed.data) !== previousQuoteFingerprint) {
            setConfirmError(t`The quote changed. Review the updated amounts before confirming.`);
            return;
          }
          const tokenIn = selectedFrom.token.contractAddress;
          const tokenOut = selectedTo.token.contractAddress;
          if (
            !isAddress(pool.address) ||
            selectedFrom.decimals === null ||
            selectedTo.decimals === null ||
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
          const confirmedSendAmount = receiptTokenAmount(
            refreshed.data.amountInRaw,
            selectedFrom.decimals,
          );
          const confirmedReceiveAmount = receiptTokenAmount(
            refreshed.data.amountOutRaw,
            selectedTo.decimals,
          );
          const submittedSendUnitValue = relaySnapshotUnitValue(
            result.valuationSnapshots,
            tokenIn,
            confirmedSendAmount,
          );
          const submittedReceiveUnitValue = relaySnapshotUnitValue(
            result.valuationSnapshots,
            tokenOut,
            confirmedReceiveAmount,
          );
          void navigate({
            to: "/pools/$poolAddress/swap/receipt",
            params: { poolAddress },
            search: {
              trackingId: result.trackingId,
              sendAmount: confirmedSendAmount,
              sendSymbol: selectedFrom.token.symbol,
              sendToken: tokenIn,
              receiveAmount: confirmedReceiveAmount,
              receiveSymbol: selectedTo.token.symbol,
              receiveToken: tokenOut,
              // The receipt reads its fees from the settlement event, which states
              // them raw in the received voucher.
              receiveDecimals: selectedTo.decimals,
              poolName: pool.name,
              ...(submittedSendUnitValue
                ? {
                    sendUoaValue: submittedSendUnitValue.value,
                    sendUoa: submittedSendUnitValue.unit,
                  }
                : { sendUoaUnavailable: true }),
              ...(submittedReceiveUnitValue
                ? {
                    receiveUoaValue: submittedReceiveUnitValue.value,
                    receiveUoa: submittedReceiveUnitValue.unit,
                  }
                : { receiveUoaUnavailable: true }),
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
            <SheetTitle className="font-heading text-[1.375rem] font-semibold tracking-tight">
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
            <Button
              size="lg"
              className="w-full"
              pending={isPending}
              onClick={() => void onConfirm()}
            >
              {isPending ? <Trans>Swapping…</Trans> : <Trans>Confirm swap</Trans>}
            </Button>
            <Button
              variant="ghost"
              size="lg"
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
        <label htmlFor={id} className="font-heading text-base font-semibold">
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
            className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-start text-sm font-bold"
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
          onValueChange={(value) => {
            onFocus();
            onAmountChange(sanitizeAmount(value));
          }}
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
        <p className="font-heading font-semibold text-sm tracking-tight">{token.token.symbol}</p>
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
      <p className="text-[0.6875rem] text-muted-foreground">
        <Trans>Voucher details unavailable</Trans>
      </p>
    );
  }
  if (variant === "from" && token.held && token.depositHeadroomRaw === "0") {
    return (
      <p className="text-[0.6875rem] text-muted-foreground">
        <Trans>The credit limit has been reached. No more can be added to this pool.</Trans>
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

function canonicalEnteredAmount(amount: string, decimals: number | null): string | null {
  if (!amount || decimals === null) return null;
  try {
    const raw = parseTokenAmount(amount, decimals);
    return formatTokenAmount(raw, decimals, decimals);
  } catch {
    return null;
  }
}

/** Keep the established two-decimal receipt style unless it would lose raw precision. */
function receiptTokenAmount(rawAmount: string, decimals: number): string {
  const fixed = formatTokenAmountFixed(rawAmount, decimals, 2);
  try {
    if (parseTokenAmount(fixed, decimals) === rawAmount) return fixed;
  } catch {
    // The exact formatter below is the safe fallback.
  }
  return formatTokenAmount(rawAmount, decimals, decimals);
}

function swapUnitValue(
  token: PoolSwapToken | undefined,
  amount: string | null,
  locale: string,
): string | null {
  if (!token || amount === null) return null;
  const valuation = formatVoucherUnitValue(amount, token.voucherValue, token.voucherUoa);
  if (!valuation) return null;
  const localized = formatUnitOfAccountDisplayValue(valuation.value, locale);
  return `${localized ?? valuation.value} ${valuation.unit}`;
}

function fixedEnteredAmount(amount: string, decimals: number | null, locale?: string): string {
  if (!amount || decimals === null) return amount;
  try {
    return formatTokenAmountFixed(parseTokenAmount(amount, decimals), decimals, 2, locale);
  } catch {
    return amount;
  }
}

/**
 * What the confirmation sheet showed. Both amounts plus the gross and the two fees
 * pin everything else: the total is their sum and the delivered output is the
 * gross less it.
 */
function quoteFingerprint(quote: {
  amountInRaw: string;
  amountOutRaw: string;
  feeBreakdown: PoolSwapFeeBreakdownRaw | null;
}): string {
  const fees = quote.feeBreakdown;
  return [
    quote.amountInRaw,
    quote.amountOutRaw,
    fees?.grossAmountOutRaw,
    fees?.poolFeeRaw,
    fees?.protocolFeeRaw,
  ].join(":");
}

function isPositiveRawAmount(value: string): boolean {
  try {
    return BigInt(value) > 0n;
  } catch {
    return false;
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
