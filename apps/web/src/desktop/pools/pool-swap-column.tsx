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
import { RiArrowDownSLine, RiArrowUpDownLine, RiCheckLine } from "react-icons/ri";
import { isAddress } from "viem";
import { useConnection } from "wagmi";

import { Button } from "#/components/ui/button";
import { PopoverContent, PopoverRoot, PopoverTitle, PopoverTrigger } from "#/components/ui/popover";
import { SectionHeading } from "#/components/ui/section-heading";
import { TokenLogo, type WalletToken, WalletAmountInput } from "#/components/wallet";
import { DeskSwapFee } from "#/desktop/pools/detail/desk-swap-fee";
import { DeskKV } from "#/desktop/ui/kv";
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

/**
 * The pool's swap, in the detail page's 360px side column. Quote, maximum, and confirmation use
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

  const flipDirection = () => {
    if (!selectedFrom || !selectedTo) return;
    setFromTokenId(selectedTo.id);
    setToTokenId(selectedFrom.id);
    setFromMaxAmountRaw(null);
    // The typed amount stays with its voucher, which is now on the other side.
    if (quoteMode === "exact-input") {
      setQuoteMode("exact-output");
      setToAmount(fromAmount);
    } else {
      setQuoteMode("exact-input");
      setFromAmount(toAmount);
    }
  };
  const fromBalance =
    selectedFrom && fromDecimals !== null
      ? formatTokenAmountFixed(selectedFrom.balanceRaw, fromDecimals, 2, locale)
      : null;
  const pickerFor = (field: "from" | "to") => {
    const tokens =
      field === "to" ? swapTokens.filter((token) => token.id !== selectedFrom?.id) : swapTokens;
    return (
      <TokenPicker
        variant={field}
        title={field === "from" ? sendLabel : receiveLabel}
        token={field === "from" ? selectedFrom?.token : selectedTo?.token}
        tokens={tokens}
        selectedId={field === "from" ? selectedFrom?.id : selectedTo?.id}
        isPending={tokensPending}
        isError={tokensError}
        locale={locale}
        open={picker?.field === field}
        onOpenChange={(open) => setPicker(open ? { field } : null)}
        onSelect={(token) => {
          if (field === "from") {
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
  };
  const feeValue = (
    part: "pool" | "protocol" | "total",
    breakdown: typeof displayedFeeBreakdown,
    pending = false,
  ) => (
    <DeskSwapFee
      breakdown={breakdown}
      part={part}
      decimals={toDecimals}
      symbol={receiveSymbol}
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
  } else if (confirmOpen) {
    const error =
      confirmError ?? (swapTransfer.error instanceof Error ? swapTransfer.error.message : null);
    const confirmedFees = quote.data?.feeBreakdown ?? null;
    body = (
      <>
        <DeskKV
          rows={[
            [
              <Trans key="label">You receive</Trans>,
              <span key="value" dir="ltr">
                {localizedQuoteToAmount} {selectedTo?.token.symbol ?? ""}
                {exactToAmount ? ` (${toUnitValue ?? t`Unavailable`})` : ""}
              </span>,
            ],
            [
              <Trans key="label">You send</Trans>,
              <span key="value" dir="ltr">
                {localizedQuoteFromAmount} {selectedFrom?.token.symbol ?? ""}
                {exactFromAmount ? ` (${fromUnitValue ?? t`Unavailable`})` : ""}
              </span>,
            ],
            [<Trans key="label">Pool fee</Trans>, feeValue("pool", confirmedFees)],
            [<Trans key="label">Protocol fee</Trans>, feeValue("protocol", confirmedFees)],
            [<Trans key="label">Total fees</Trans>, feeValue("total", confirmedFees)],
            [
              <Trans key="label">Pool</Trans>,
              <span key="value" dir="auto" className="font-sans">
                {pool.name}
              </span>,
            ],
          ]}
        />
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            disabled={swapTransfer.isPending}
            onClick={() => setConfirmOpen(false)}
          >
            <Trans>Cancel</Trans>
          </Button>
          <Button pending={swapTransfer.isPending} onClick={() => void confirm()}>
            {swapTransfer.isPending ? <Trans>Swapping…</Trans> : <Trans>Confirm swap</Trans>}
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
            amount={displayedFromAmount}
            invalid={exceedsBalance || exceedsDepositCap}
            picker={pickerFor("from")}
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
          />
          <AmountHelp
            lead={
              fromBalance !== null ? (
                <>
                  <Trans>Balance</Trans>{" "}
                  <span dir="ltr" className="font-mono">
                    {fromBalance}
                  </span>
                </>
              ) : null
            }
            unitValue={exactFromAmount ? (fromUnitValue ?? t`Unavailable`) : undefined}
            max={localizedMaxFromAmount}
            symbol={selectedFrom?.token.symbol}
            maxDisabled={!maxSettled}
            onMax={applyMax}
          />
        </div>
        <div className="grid place-items-center">
          <Button
            variant="outline"
            size="icon"
            aria-label={t`Reverse swap direction`}
            disabled={!selectedFrom || !selectedTo || !selectedTo.canSwapIn}
            onClick={flipDirection}
          >
            <RiArrowUpDownLine aria-hidden="true" />
          </Button>
        </div>
        <div className="grid gap-1.5">
          <AmountBox
            id="desk-swap-receive-amount"
            label={receiveLabel}
            amount={displayedToAmount}
            highlighted
            autoFocus={focused}
            picker={pickerFor("to")}
            onFocus={() => setFocusedField("to")}
            onBlur={() => {
              if (quoteMode === "exact-output")
                setToAmount(fixedEnteredAmount(toAmount, toDecimals));
              setFocusedField((current) => (current === "to" ? null : current));
            }}
            onAmountChange={(amount) => {
              setQuoteMode("exact-output");
              setFromMaxAmountRaw(null);
              setToAmount(amount);
            }}
          />
          <AmountHelp
            unitValue={exactToAmount ? (toUnitValue ?? t`Unavailable`) : undefined}
            max={maxReceiveAmount ?? undefined}
            symbol={selectedTo?.token.symbol}
            maxDisabled={!maxSettled}
            onMax={applyMax}
          />
        </div>
        <DeskKV
          rows={[
            [
              <Trans key="label">Rate</Trans>,
              rate !== "—" && selectedFrom && selectedTo ? (
                <span key="value" dir="ltr">
                  1 {selectedFrom.token.symbol} = {rate} {selectedTo.token.symbol}
                </span>
              ) : (
                <span key="value" className="text-muted-foreground">
                  —
                </span>
              ),
            ],
            [
              <Trans key="label">Pool fee</Trans>,
              feeValue("pool", displayedFeeBreakdown, feesPending),
            ],
            [
              <Trans key="label">Protocol fee</Trans>,
              feeValue("protocol", displayedFeeBreakdown, feesPending),
            ],
            [
              <Trans key="label">Total fees</Trans>,
              feeValue("total", displayedFeeBreakdown, feesPending),
            ],
          ]}
        />
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
        <Button
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
      </>
    );
  }

  return (
    <section
      aria-labelledby="desk-swap-title"
      className="grid min-w-0 gap-3 border border-border bg-card p-4"
    >
      <SectionHeading as="h2" variant="section" id="desk-swap-title">
        {confirmOpen ? <Trans>Confirm swap</Trans> : <Trans>Swap</Trans>}
      </SectionHeading>
      {body}
    </section>
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
        onValueChange={(value) => {
          onFocus();
          onAmountChange(sanitizeAmount(value));
        }}
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
