import { formatTokenAmount, formatTokenAmountFixed } from "@clc/core/features/wallet/logic";
import { useLingui } from "@lingui/react/macro";
import { useIsMutating } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";
import { useConnection } from "wagmi";

import { usePoolSwapMaximum } from "#/features/pools/hooks/use-pool-swap-maximum";
import {
  type PoolSwapQuoteMode,
  usePoolSwapQuote,
} from "#/features/pools/hooks/use-pool-swap-quote";
import { usePoolSwapTokenReads } from "#/features/pools/hooks/use-pool-swap-tokens";
import {
  poolSwapTransferMutationKey,
  usePoolSwapTransfer,
} from "#/features/pools/hooks/use-pool-swap-transfer";
import { usePoolSwapVouchers } from "#/features/pools/hooks/use-pool-swap-vouchers";
import { useUserPoolByAddress } from "#/features/pools/hooks/use-user-pools";
import {
  canonicalEnteredAmount,
  exceedsSwapBalance,
  fixedEnteredAmount,
  formatSwapRate,
  isPositiveRawAmount,
  poolSwapNotice,
  poolSwapReceiptSearch,
  recheckSwapQuote,
  sanitizeSwapAmount,
  swapUnitValue,
} from "#/features/pools/logic/pool-swap-form";
import {
  type PoolSwapToken,
  buildPoolSwapTokens,
  defaultPoolSwapFrom,
  defaultPoolSwapTo,
} from "#/features/pools/logic/pool-swap-tokens";
import { useCaliburDelegation } from "#/features/webauthn/hooks/use-calibur-delegation";

export type PoolSwapField = "from" | "to";

/**
 * The pool swap: its voucher menu, the two amounts and which one drives the
 * quote, Max, the confirm-time recheck and the relay. The phone screen and the
 * desktop column both run on it and only lay it out, so a rule about stale
 * quotes or limits changes in one place for both.
 */
export function usePoolSwapForm({
  poolAddress,
  receiveTokenAddress,
}: {
  poolAddress: string;
  /** A voucher to open the "You receive" side on, from the screen that linked here. */
  receiveTokenAddress?: string;
}) {
  const { i18n, t } = useLingui();
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const navigate = useNavigate();
  const { address } = useConnection();
  const delegationStatus = useCaliburDelegation(address as `0x${string}` | undefined);
  const swapTransfer = usePoolSwapTransfer();
  // A layout switch unmounts the view that confirmed a swap, but not its relay:
  // that keeps running and still opens the receipt. Read from the mutation
  // cache rather than this view's own mutation, so the view that mounts in its
  // place cannot confirm a second swap meanwhile.
  const inFlight = useIsMutating({ mutationKey: poolSwapTransferMutationKey }) > 0;
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
  const [focusedField, setFocusedField] = useState<PoolSwapField | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // A view that stays mounted while the URL names another voucher to receive
  // (the desktop column beside a pool's voucher links) follows it.
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
  // The side being typed in shows the raw entry; a settled side shows the
  // grouped two-place figure.
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

  // The pair-specific maximum combines the holder balance, the input deposit
  // headroom, and output liquidity converted through the pool's gross quoter.
  // Fees come out of the output leg, so they lower what arrives, not what may be
  // sent. Until that boundary is known for this pair no fallback Max is shown; a
  // refresh keeps the last answer for the same pair rather than blinking it out.
  const maximumRaw = maximum.data?.maxAmountInRaw;
  const maxFromRaw =
    maximumRaw !== undefined && isPositiveRawAmount(maximumRaw) ? maximumRaw : null;
  const maxReceiveRaw = maximum.data?.maxAmountOutRaw;
  const displayedFeeBreakdown =
    quote.isError || quote.isPlaceholderData ? null : (quote.data?.feeBreakdown ?? null);
  // A lent answer from the previous block may be showing. It is fine to read, but
  // not to spend: the pin outlives the refresh, so a balance, cap or liquidity
  // that has since fallen would leave it above what the swap can carry.
  const maxSettled = !maximum.isPlaceholderData;

  const exceedsBalance = exceedsSwapBalance({
    mode: quoteMode,
    token: selectedFrom,
    fromAmount,
    fromMaxAmountRaw,
    quotedAmountInRaw: quote.data?.amountInRaw,
  });
  const exceedsDepositCap = quote.data?.exceedsDepositCap === true;
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

  const unitLabel = (token: PoolSwapToken | undefined, amount: string | null) =>
    amount ? (swapUnitValue(token, amount, locale) ?? t`Unavailable`) : null;

  // Max on either side is the same request: spend the pinned raw maximum.
  // Filling the receive side by typing its figure back in would round the send
  // side up by a wei and could overrun the balance.
  const applyMax = () => {
    if (!maxSettled || maxFromRaw === null || fromDecimals === null) return;
    setQuoteMode("exact-input");
    setFromMaxAmountRaw(maxFromRaw);
    setFromAmount(formatTokenAmountFixed(maxFromRaw, fromDecimals, 2));
  };

  const focusField = (field: PoolSwapField) => setFocusedField(field);
  const blurField = (field: PoolSwapField) => {
    if (field === "from" && quoteMode === "exact-input") {
      setFromAmount(fixedEnteredAmount(fromAmount, fromDecimals));
    }
    if (field === "to" && quoteMode === "exact-output") {
      setToAmount(fixedEnteredAmount(toAmount, toDecimals));
    }
    setFocusedField((current) => (current === field ? null : current));
  };
  /** Typing on a side makes it the one the quote is sized from. */
  const changeAmount = (field: PoolSwapField, value: string) => {
    const amount = sanitizeSwapAmount(value);
    setFocusedField(field);
    setFromMaxAmountRaw(null);
    if (field === "from") {
      setQuoteMode("exact-input");
      setFromAmount(amount);
    } else {
      setQuoteMode("exact-output");
      setToAmount(amount);
    }
  };

  const selectFrom = (token: PoolSwapToken) => {
    setFromMaxAmountRaw(null);
    if (token.id === selectedTo?.id) setToTokenId(selectedFrom?.id);
    setFromTokenId(token.id);
  };
  const selectTo = (token: PoolSwapToken) => setToTokenId(token.id);

  const canFlip = !!selectedFrom && !!selectedTo && selectedTo.canSwapIn;
  const flip = () => {
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

  const openConfirm = () => {
    if (!selectedFrom || !selectedTo || !isValidAmount || inFlight) return;
    setConfirmError(null);
    setConfirmOpen(true);
  };

  const confirm = async () => {
    if (
      !address ||
      !pool ||
      !selectedFrom ||
      !selectedTo ||
      !quote.data ||
      !isValidAmount ||
      inFlight
    ) {
      return;
    }
    setConfirmError(null);
    const reviewed = quote.data;
    const refreshed = await quote.refetch();
    const problem = recheckSwapQuote(reviewed, refreshed);
    if (problem === "unverified") {
      setConfirmError(t`Couldn't verify this swap. Try again.`);
      return;
    }
    if (problem === "liquidity") {
      setConfirmError(t`Pool liquidity changed. Review the updated quote and try again.`);
      return;
    }
    if (problem === "depositCap") {
      setConfirmError(
        t`This pool's credit limit changed. Review the updated amounts and try again.`,
      );
      return;
    }
    if (problem === "changed") {
      setConfirmError(t`The quote changed. Review the updated amounts before confirming.`);
      return;
    }
    const confirmed = refreshed.data;
    const tokenIn = selectedFrom.token.contractAddress;
    const tokenOut = selectedTo.token.contractAddress;
    if (
      !confirmed ||
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
        hopAmountIns: [confirmed.amountInRaw],
        includeAuthorization: delegationStatus === "not-delegated",
      })
      .catch(() => null);
    if (!result) return;
    void navigate({
      to: "/pools/$poolAddress/swap/receipt",
      params: { poolAddress },
      search: poolSwapReceiptSearch({
        result,
        confirmed,
        send: {
          symbol: selectedFrom.token.symbol,
          token: tokenIn,
          decimals: selectedFrom.decimals,
        },
        receive: {
          symbol: selectedTo.token.symbol,
          token: tokenOut,
          decimals: selectedTo.decimals,
        },
        poolName: pool.name,
      }),
    });
  };

  return {
    locale,
    poolQuery,
    pool,

    /** The pool's whole menu; the receive side omits whatever is being sent. */
    swapTokens,
    receiveTokens: swapTokens.filter((token) => token.id !== selectedFrom?.id),
    tokensPending,
    tokensError,
    tokensRetrying: vouchersQuery.isFetching || reads.isFetching,
    retryTokens: () => {
      vouchersQuery.refetch();
      void reads.refetch();
    },
    selectedFrom,
    selectedTo,
    selectFrom,
    selectTo,
    canFlip,
    flip,

    fromAmount: focusedField === "from" ? editableFromAmount : settledFromAmount,
    toAmount: focusedField === "to" ? editableToAmount : settledToAmount,
    /** Each side's exact amount in its unit of account; null while it has no amount. */
    fromUnitValue: unitLabel(selectedFrom, exactFromAmount),
    toUnitValue: unitLabel(selectedTo, exactToAmount),
    fromBalance:
      selectedFrom && fromDecimals !== null
        ? formatTokenAmountFixed(selectedFrom.balanceRaw, fromDecimals, 2, locale)
        : null,
    fromInvalid: exceedsBalance || exceedsDepositCap,
    focusField,
    blurField,
    changeAmount,

    maxFromAmount:
      maxFromRaw !== null && fromDecimals !== null
        ? formatTokenAmountFixed(maxFromRaw, fromDecimals, 2, locale)
        : undefined,
    maxReceiveAmount:
      maxReceiveRaw && toDecimals !== null && isPositiveRawAmount(maxReceiveRaw)
        ? formatTokenAmountFixed(maxReceiveRaw, toDecimals, 2, locale)
        : undefined,
    /** Max stays visible but cannot be used while its figure is a stale one. */
    maxSettled,
    applyMax,

    rate: formatSwapRate(quote.data, fromDecimals, toDecimals, locale),
    feeBreakdown: displayedFeeBreakdown,
    feesPending: quote.isFetching && !displayedFeeBreakdown,
    toDecimals,
    receiveSymbol: selectedTo?.token.symbol ?? "",

    notice: poolSwapNotice({
      tokensPending,
      tokensError,
      tokenCount: swapTokens.length,
      hasSwappableFrom: swapTokens.some((token) => token.canSwapIn),
      quote,
      exceedsBalance,
      exceedsDepositCap,
      sourceAmount,
    }),
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
    quoteRetrying: quote.isFetching,
    retryQuote: () => void quote.refetch(),

    canReview: isValidAmount && !!selectedFrom && !!selectedTo,
    /** A pool swap is relaying, from this view or one a layout switch replaced. */
    inFlight,
    openConfirm,
    confirmOpen,
    setConfirmOpen,
    confirmFromAmount: localizedQuoteFromAmount,
    confirmToAmount: localizedQuoteToAmount,
    confirmFeeBreakdown: quote.data?.feeBreakdown ?? null,
    confirmError:
      confirmError ?? (swapTransfer.error instanceof Error ? swapTransfer.error.message : null),
    confirm,
  };
}
