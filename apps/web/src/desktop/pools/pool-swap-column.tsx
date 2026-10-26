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
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { RiArrowDownSLine, RiCheckLine } from "react-icons/ri";
import { isAddress } from "viem";
import { useConnection } from "wagmi";

import { Button } from "#/components/ui/button";
import { SectionHeading } from "#/components/ui/section-heading";
import { TokenLogo, type WalletToken, WalletAmountInput } from "#/components/wallet";
import { DeskInspector } from "#/desktop/ui/inspector";
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
import { relaySnapshotUnitValue } from "#/features/wallet/logic/relay-valuation";
import { useCaliburDelegation } from "#/features/webauthn/hooks/use-calibur-delegation";
import { cn } from "#/lib/utils";
import { PoolSwapFeeValue } from "#/features/pools/ui/pool-swap-fee-value";

/**
 * The pool's swap, in the 380px column. Quote, maximum, and confirmation use
 * the same hooks as the phone swap — this file only changes the layout.
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

  useEffect(() => {
    if (!receiveTokenAddress) return;
    setToTokenId(receiveTokenAddress.toLowerCase());
  }, [receiveTokenAddress]);

  const swapTokens = useMemo(
    () => (pool ? buildPoolSwapTokens({ pool, vouchers, reads: reads.data }) : []),
    [pool, vouchers, reads.data],
  );
  const tokensPending = vouchersQuery.isPending || reads.isLoading;
  const tokensError = vouchersQuery.isError || reads.isError;

  const chosenFrom = swapTokens.find((token) => token.id === fromTokenId);
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
  const maxSettled = !maximum.isPlaceholderData;
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
    pool?.active !== false &&
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

  const confirm = async () => {
    if (!address || !pool || !selectedFrom || !selectedTo || !quote.data || !isValidAmount) return;
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
        receiveDecimals: selectedTo.decimals,
        poolName: pool.name,
        ...(submittedSendUnitValue
          ? { sendUoaValue: submittedSendUnitValue.value, sendUoa: submittedSendUnitValue.unit }
          : { sendUoaUnavailable: true }),
        ...(submittedReceiveUnitValue
          ? {
              receiveUoaValue: submittedReceiveUnitValue.value,
              receiveUoa: submittedReceiveUnitValue.unit,
            }
          : { receiveUoaUnavailable: true }),
      },
    });
  };

  let body: ReactNode = null;
  let footer: ReactNode = null;
  if (poolQuery.isLoading) {
    body = <p className="text-sm text-muted-foreground">{t`Loading pool…`}</p>;
  } else if (poolQuery.isError) {
    body = <p className="text-sm text-muted-foreground">{t`Couldn't load this pool.`}</p>;
  } else if (!pool) {
    body = <p className="text-sm text-muted-foreground">{t`Pool not found.`}</p>;
  } else if (pool.active === false) {
    body = (
      <p className="text-sm text-muted-foreground">
        {t`This pool is retired. New swaps and deposits are not available.`}
      </p>
    );
  } else if (confirmOpen) {
    const error =
      confirmError ?? (swapTransfer.error instanceof Error ? swapTransfer.error.message : null);
    body = (
      <div className="space-y-3">
        <div className="border border-border">
          <ConfirmRow label={<Trans>You receive</Trans>}>
            {localizedQuoteToAmount} {selectedTo?.token.symbol ?? ""}
            {exactToAmount ? ` (${toUnitValue ?? t`Unavailable`})` : ""}
          </ConfirmRow>
          <ConfirmRow label={<Trans>You send</Trans>}>
            {localizedQuoteFromAmount} {selectedFrom?.token.symbol ?? ""}
            {exactFromAmount ? ` (${fromUnitValue ?? t`Unavailable`})` : ""}
          </ConfirmRow>
          <ConfirmRow label={<Trans>Pool fee</Trans>}>
            <PoolSwapFeeValue
              breakdown={quote.data?.feeBreakdown ?? null}
              part="pool"
              decimals={toDecimals}
              symbol={selectedTo?.token.symbol ?? ""}
              locale={locale}
            />
          </ConfirmRow>
          <ConfirmRow label={<Trans>Protocol fee</Trans>}>
            <PoolSwapFeeValue
              breakdown={quote.data?.feeBreakdown ?? null}
              part="protocol"
              decimals={toDecimals}
              symbol={selectedTo?.token.symbol ?? ""}
              locale={locale}
            />
          </ConfirmRow>
          <ConfirmRow label={<Trans>Total fees</Trans>}>
            <PoolSwapFeeValue
              breakdown={quote.data?.feeBreakdown ?? null}
              part="total"
              decimals={toDecimals}
              symbol={selectedTo?.token.symbol ?? ""}
              locale={locale}
            />
          </ConfirmRow>
          <ConfirmRow label={<Trans>Pool</Trans>} last>
            {pool.name}
          </ConfirmRow>
        </div>
        {error ? (
          <p className="text-destructive text-xs" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
    footer = (
      <div className="flex flex-col gap-2">
        <Button
          tap
          className="w-full"
          pending={swapTransfer.isPending}
          onClick={() => void confirm()}
        >
          {swapTransfer.isPending ? <Trans>Swapping…</Trans> : <Trans>Confirm swap</Trans>}
        </Button>
        <Button
          variant="ghost"
          tap
          className="w-full"
          disabled={swapTransfer.isPending}
          onClick={() => setConfirmOpen(false)}
        >
          <Trans>Cancel</Trans>
        </Button>
      </div>
    );
  } else if (picker) {
    const variant = picker.field;
    const tokens =
      variant === "to" ? swapTokens.filter((token) => token.id !== selectedFrom?.id) : swapTokens;
    body = (
      <TokenList
        variant={variant}
        title={variant === "from" ? sendLabel : receiveLabel}
        tokens={tokens}
        selectedId={variant === "from" ? selectedFrom?.id : selectedTo?.id}
        isPending={tokensPending}
        isError={tokensError}
        locale={locale}
        onClose={() => setPicker(null)}
        onSelect={(token) => {
          if (variant === "from") {
            setFromMaxAmountRaw(null);
            if (token.id === selectedTo?.id) setToTokenId(selectedFrom?.id);
            setFromTokenId(token.id);
          } else {
            setToTokenId(token.id);
          }
          setPicker(null);
        }}
      />
    );
  } else {
    body = (
      <div className="space-y-3">
        <SwapField
          id="desk-swap-receive-amount"
          highlighted
          label={receiveLabel}
          token={selectedTo?.token}
          amount={displayedToAmount}
          unitValue={exactToAmount ? (toUnitValue ?? t`Unavailable`) : undefined}
          autoFocus={focused}
          max={maxReceiveAmount ?? undefined}
          actionsDisabled={!maxSettled}
          onFocus={() => setFocusedField("to")}
          onBlur={() => {
            if (quoteMode === "exact-output") setToAmount(fixedEnteredAmount(toAmount, toDecimals));
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
          id="desk-swap-send-amount"
          label={sendLabel}
          token={selectedFrom?.token}
          amount={displayedFromAmount}
          unitValue={exactFromAmount ? (fromUnitValue ?? t`Unavailable`) : undefined}
          max={localizedMaxFromAmount}
          actionsDisabled={!maxSettled}
          invalid={exceedsBalance || exceedsDepositCap}
          onFocus={() => setFocusedField("from")}
          onBlur={() => {
            if (quoteMode === "exact-input")
              setFromAmount(fixedEnteredAmount(fromAmount, fromDecimals));
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
        <div className="border border-border">
          <div className="flex items-center justify-between border-border border-b px-3 py-2">
            <span className="text-muted-foreground text-xs">
              <Trans>Rate</Trans>
            </span>
            <span dir="ltr" className="font-mono text-xs font-semibold">
              1 {selectedFrom?.token.symbol ?? "—"} = {rate} {selectedTo?.token.symbol ?? "—"}
            </span>
          </div>
          <FeeRow label={<Trans>Pool fee</Trans>} last={false}>
            <PoolSwapFeeValue
              breakdown={displayedFeeBreakdown}
              part="pool"
              decimals={toDecimals}
              symbol={receiveSymbol}
              locale={locale}
              pending={feesPending}
            />
          </FeeRow>
          <FeeRow label={<Trans>Protocol fee</Trans>} last={false}>
            <PoolSwapFeeValue
              breakdown={displayedFeeBreakdown}
              part="protocol"
              decimals={toDecimals}
              symbol={receiveSymbol}
              locale={locale}
              pending={feesPending}
            />
          </FeeRow>
          <FeeRow label={<Trans>Total fees</Trans>} last>
            <PoolSwapFeeValue
              breakdown={displayedFeeBreakdown}
              part="total"
              decimals={toDecimals}
              symbol={receiveSymbol}
              locale={locale}
              pending={feesPending}
            />
          </FeeRow>
        </div>
        <SwapNotices
          tokensPending={tokensPending}
          tokensError={tokensError}
          swapTokensCount={swapTokens.length}
          hasSwappableFrom={hasSwappableFrom}
          fetching={vouchersQuery.isFetching || reads.isFetching}
          onRetry={() => {
            vouchersQuery.refetch();
            void reads.refetch();
          }}
          quoteError={quote.isError && !quote.isDebouncing}
          quoteFetching={quote.isFetching}
          onQuoteRetry={() => void quote.refetch()}
          exceedsBalance={exceedsBalance}
          exceedsDepositCap={exceedsDepositCap}
          depositHeadroomZero={quote.data?.depositHeadroomRaw === "0"}
          depositHeadroom={localizedAmounts.depositHeadroom}
          fromSymbol={selectedFrom?.token.symbol}
          noLiquidity={
            !!quote.data &&
            !quote.isDebouncing &&
            !quote.isPlaceholderData &&
            !quote.data.hasLiquidity
          }
          availableOutZero={quote.data ? BigInt(quote.data.availableAmountOutRaw) === 0n : false}
          availableOut={localizedAmounts.availableAmountOut}
          toSymbol={selectedTo?.token.symbol}
          nonPositive={sourceAmount.trim() !== "" && Number(sourceAmount) <= 0}
        />
      </div>
    );
    footer = (
      <Button
        tap
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
    );
  }

  return (
    <DeskInspector
      title={<Trans>Swap</Trans>}
      footer={footer}
      className={focused ? "bg-card" : undefined}
    >
      {body}
    </DeskInspector>
  );
}

function SwapNotices({
  tokensPending,
  tokensError,
  swapTokensCount,
  hasSwappableFrom,
  fetching,
  onRetry,
  quoteError,
  quoteFetching,
  onQuoteRetry,
  exceedsBalance,
  exceedsDepositCap,
  depositHeadroomZero,
  depositHeadroom,
  fromSymbol,
  noLiquidity,
  availableOutZero,
  availableOut,
  toSymbol,
  nonPositive,
}: {
  tokensPending: boolean;
  tokensError: boolean;
  swapTokensCount: number;
  hasSwappableFrom: boolean;
  fetching: boolean;
  onRetry: () => void;
  quoteError: boolean;
  quoteFetching: boolean;
  onQuoteRetry: () => void;
  exceedsBalance: boolean;
  exceedsDepositCap: boolean;
  depositHeadroomZero: boolean;
  depositHeadroom: string | null;
  fromSymbol: string | undefined;
  noLiquidity: boolean;
  availableOutZero: boolean;
  availableOut: string | null;
  toSymbol: string | undefined;
  nonPositive: boolean;
}) {
  const { t } = useLingui();
  if (tokensPending) {
    return (
      <p className="text-muted-foreground text-xs">
        <Trans>Checking which vouchers this pool takes…</Trans>
      </p>
    );
  }
  if (tokensError) {
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
  }
  if (swapTokensCount === 0) {
    return (
      <p role="alert" className="text-muted-foreground text-xs">
        <Trans>This pool doesn't take any vouchers yet.</Trans>
      </p>
    );
  }
  if (!hasSwappableFrom) {
    return (
      <p role="alert" className="text-muted-foreground text-xs">
        <Trans>You don't hold any voucher this pool takes.</Trans>
      </p>
    );
  }
  if (quoteError) {
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
  }
  if (exceedsBalance) {
    return (
      <p role="alert" className="text-destructive text-xs">
        <Trans>Amount exceeds your balance</Trans>
      </p>
    );
  }
  if (exceedsDepositCap) {
    return (
      <p role="alert" className="text-destructive text-xs">
        {depositHeadroomZero ? (
          <Trans>This pool can't take any more {fromSymbol} right now.</Trans>
        ) : (
          <Trans>
            This pool can only take {depositHeadroom} more {fromSymbol} right now.
          </Trans>
        )}
      </p>
    );
  }
  if (noLiquidity) {
    return (
      <p role="alert" className="text-destructive text-xs">
        {availableOutZero ? (
          <Trans>This pool has no {toSymbol} available to swap.</Trans>
        ) : (
          <Trans>
            This pool only has {availableOut} {toSymbol} available to swap.
          </Trans>
        )}
      </p>
    );
  }
  if (nonPositive) {
    return (
      <p role="alert" className="text-destructive text-xs">
        <Trans>Enter an amount greater than zero.</Trans>
      </p>
    );
  }
  return null;
}

function FeeRow({
  label,
  last,
  children,
}: {
  label: ReactNode;
  last: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-h-11 items-center justify-between gap-3 px-3 py-2",
        !last && "border-border border-b",
      )}
    >
      <span className="text-muted-foreground text-xs">{label}</span>
      {children}
    </div>
  );
}

function ConfirmRow({
  label,
  last = false,
  children,
}: {
  label: ReactNode;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-h-11 items-center justify-between gap-3 px-3 py-2.5",
        !last && "border-border border-b",
      )}
    >
      <span className="text-muted-foreground text-xs">{label}</span>
      <span dir="ltr" className="min-w-0 break-words text-end font-mono text-xs font-semibold">
        {children}
      </span>
    </div>
  );
}

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

function TokenList({
  variant,
  title,
  tokens,
  selectedId,
  isPending,
  isError,
  locale,
  onClose,
  onSelect,
}: {
  variant: "from" | "to";
  title: string;
  tokens: PoolSwapToken[];
  selectedId?: string;
  isPending: boolean;
  isError: boolean;
  locale: string;
  onClose: () => void;
  onSelect: (token: PoolSwapToken) => void;
}) {
  const selectable = (token: PoolSwapToken) =>
    variant === "from" ? token.canSwapIn : token.canSwapOut;
  const firstUnheldIndex = variant === "from" ? tokens.findIndex((token) => !token.held) : -1;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <SectionHeading as="h3" variant="group">
          {title}
        </SectionHeading>
        <Button type="button" variant="ghost" onClick={onClose}>
          <Trans>Cancel</Trans>
        </Button>
      </div>
      {isPending ? (
        <p className="text-muted-foreground text-sm">
          <Trans>Loading vouchers…</Trans>
        </p>
      ) : isError ? (
        <p role="alert" className="text-destructive text-sm">
          <Trans>Couldn't load this pool's vouchers.</Trans>
        </p>
      ) : tokens.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          <Trans>This pool doesn't take any vouchers yet.</Trans>
        </p>
      ) : (
        tokens.map((token, index) => (
          <div key={token.id}>
            {index === firstUnheldIndex && index > 0 ? (
              <SectionHeading variant="group" as="h3" className="pt-2 pb-1">
                <Trans>Not held</Trans>
              </SectionHeading>
            ) : null}
            <TokenRow
              token={token}
              variant={variant}
              selected={token.id === selectedId}
              disabled={!selectable(token)}
              locale={locale}
              onSelect={() => onSelect(token)}
            />
          </div>
        ))
      )}
    </div>
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
        "flex w-full items-center gap-3 px-2 py-2 text-start",
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
        <Trans>The credit limit has been reached. No more can be added to this pool.</Trans>
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

function canonicalEnteredAmount(amount: string, decimals: number | null): string | null {
  if (!amount || decimals === null) return null;
  try {
    const raw = parseTokenAmount(amount, decimals);
    return formatTokenAmount(raw, decimals, decimals);
  } catch {
    return null;
  }
}

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
