import {
  type CreditQuote,
  type CreditQuoteRequest,
  type CreditRoute,
  creditRouterFailure,
} from "@clc/api/features/credit-router/client";
import {
  creditReachQueryOptions,
  creditRouterKeys,
  creditRoutesInfiniteQueryOptions,
} from "@clc/api/features/credit-router/queries";
import { createRelayerClient } from "@clc/api/features/relayer/client";
import { relayerHealthQueryOptions } from "@clc/api/features/relayer/queries";
import type { CreditQuoteMode } from "@clc/core/features/credit-router/logic";
import { formatTokenAmountFixed, parseTokenAmount } from "@clc/core/features/wallet/logic";
import {
  keepPreviousData,
  useInfiniteQuery,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getAddress } from "viem";
import { useConnection } from "wagmi";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { relayCreditQuote } from "#/features/credit/api/relay-credit-quote";
import {
  type CreditPayOption,
  creditPayOption,
  creditRouteHopRefs,
  creditRouteKey,
  mergeCreditRouteGroups,
} from "#/features/credit/logic/credit-routes";
import { sanitizeSwapAmount } from "#/features/pools/logic/pool-swap-form";
import {
  type CaliburSigner,
  resolveCaliburSigner,
} from "#/features/webauthn/api/relay-calibur-batch";
import { creditRouterClient } from "#/lib/api/credit-router";
import { CHAIN_ID_BIGINT } from "#/lib/chain";
import { CALIBUR_ADDRESS, RELAYER_URL } from "#/lib/relayer-config";
import { useDebouncedValue } from "#/lib/use-debounced-value";
import { useVoucherLabels } from "./use-voucher-labels";

const relayerClient = createRelayerClient(RELAYER_URL);

const AMOUNT_DEBOUNCE_MS = 400;
/** A quote this close to its deadline is asked again rather than signed. */
const QUOTE_EXPIRY_MARGIN_S = 15;

/**
 * Every credit-route relay, whichever view started it, so a remounted view
 * holds its own Confirm back while one is in flight.
 */
const creditRelayMutationKey = ["credit-router", "relay"] as const;

type Review = {
  request: CreditQuoteRequest;
  quote: CreditQuote;
  signer: CaliburSigner;
  route: CreditRoute;
};

/**
 * Obtaining one voucher through as many pools as the router routes: an amount
 * to get (exact output, the default) or to spend (exact input), one option per
 * voucher the wallet could pay with, the authoritative quote, its review, and
 * the checked, self-signed relay.
 */
export function useCreditGet(targetAddress: `0x${string}`) {
  const auth = useAuthStatus();
  const { connector } = useConnection();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const wallet = auth.isAuthenticated ? auth.address : undefined;

  const [mode, setMode] = useState<CreditQuoteMode>("exactOutput");
  const [amount, setAmount] = useState("");
  /** The voucher the person picked to pay with, lower case. */
  const [chosenVoucher, setChosenVoucher] = useState<string | null>(null);
  /** The route the person picked for a voucher under "Other ways", by lower-case voucher. */
  const [routeChoices, setRouteChoices] = useState<Record<string, string>>({});
  const [review, setReview] = useState<Review | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [requoted, setRequoted] = useState(false);

  const listingParams = { to: targetAddress } as const;
  const listing = useInfiniteQuery(
    creditRoutesInfiniteQueryOptions(creditRouterClient, wallet ?? "", listingParams),
  );
  const listingGroups = useMemo(
    () => mergeCreditRouteGroups(listing.data?.pages),
    [listing.data?.pages],
  );
  const target = listing.data?.pages[0]?.target;
  // The wallet's own vouchers come with the reach the swap counts read; a
  // target already among them is worth saying before any route.
  const reach = useQuery(creditReachQueryOptions(creditRouterClient, wallet ?? ""));
  const heldBalance = reach.data?.inputs.find(
    (input) => input.voucher.toLowerCase() === targetAddress.toLowerCase(),
  )?.balance;

  const labels = useVoucherLabels([targetAddress, ...listingGroups.map((group) => group.voucher)]);
  const decimalsOf = (voucher: string) => labels.get(voucher.toLowerCase())?.decimals ?? null;
  // An amount to spend is counted in the voucher spent: the one picked, or
  // the decimals every voucher shares. Vouchers with other decimals wait to
  // be picked before they are priced.
  const inputDecimals = [...new Set(listingGroups.map((group) => decimalsOf(group.voucher)))];
  const spendDecimals = chosenVoucher
    ? decimalsOf(chosenVoucher)
    : inputDecimals.length === 1
      ? inputDecimals[0]!
      : null;
  const amountDecimals =
    mode === "exactOutput" ? (target?.decimals ?? decimalsOf(targetAddress)) : spendDecimals;
  const { settled: settledAmount, isPending: amountDebouncing } = useDebouncedValue(
    amount,
    AMOUNT_DEBOUNCE_MS,
  );
  const amountRaw = useMemo(() => {
    if (!settledAmount || amountDecimals === null) return undefined;
    try {
      const raw = parseTokenAmount(settledAmount, amountDecimals);
      return BigInt(raw) > 0n ? raw : undefined;
    } catch {
      return undefined;
    }
  }, [settledAmount, amountDecimals]);

  // Every voucher is priced in one listing: the server applies the amount to
  // each group, so an amount to spend reads the same for every voucher that
  // shares its decimals.
  const sizedParams = amountRaw ? { ...listingParams, amount: amountRaw, mode } : null;
  const sized = useInfiniteQuery({
    ...creditRoutesInfiniteQueryOptions(
      creditRouterClient,
      wallet ?? "",
      sizedParams ?? listingParams,
    ),
    enabled: !!wallet && sizedParams !== null,
    placeholderData: keepPreviousData,
  });

  // A listing that changed between pages answers E28: start it again from the top.
  const staleKeys = [
    creditRouterFailure(listing.error)?.state === "cursor_stale" ? listingParams : null,
    creditRouterFailure(sized.error)?.state === "cursor_stale" ? sizedParams : null,
  ].flatMap((params) =>
    params && wallet ? [JSON.stringify(creditRouterKeys.routes(wallet, params))] : [],
  );
  const staleKeyList = staleKeys.join("|");
  useEffect(() => {
    if (!staleKeyList) return;
    for (const key of staleKeyList.split("|")) {
      void queryClient.resetQueries({ queryKey: JSON.parse(key) as readonly unknown[] });
    }
  }, [staleKeyList, queryClient]);

  const active = sizedParams ? sized : listing;
  const sizedGroups = useMemo(
    () => (sizedParams && sized.data ? mergeCreditRouteGroups(sized.data.pages) : null),
    [sizedParams, sized.data],
  );
  const firstPage = active.data?.pages[0];
  const typed = amount !== "";

  // One option per voucher, in the server's order. A voucher the amount was
  // not counted for shows its listed routes until it is.
  const options = useMemo(() => {
    const listed = new Map(listingGroups.map((group) => [group.voucher.toLowerCase(), group]));
    return (sizedGroups ?? listingGroups).flatMap((group) => {
      const key = group.voucher.toLowerCase();
      const priced =
        sizedGroups !== null &&
        (mode === "exactOutput" || labels.get(key)?.decimals === amountDecimals) &&
        group.routes.some((route) => route.carriesAmount !== undefined);
      const option = priced
        ? creditPayOption(group, "priced", routeChoices[key])
        : creditPayOption(listed.get(key) ?? group, typed ? "pending" : "idle", routeChoices[key]);
      return option ? [option] : [];
    });
  }, [listingGroups, sizedGroups, mode, labels, amountDecimals, typed, routeChoices]);

  // The picked voucher while it can still pay; otherwise the one voucher that
  // can, once it is known to. Several vouchers are never chosen between for
  // the person: they are not comparable.
  const selectable = options.filter((option) => option.state !== "refused");
  const chosenOption = selectable.find((option) => option.voucher.toLowerCase() === chosenVoucher);
  const onlyOption =
    selectable.length === 1 && selectable[0]!.state !== "pending" ? selectable[0] : undefined;
  const selectedOption = chosenOption ?? onlyOption;
  const selected = selectedOption?.route;

  const quoteMutation = useMutation({
    mutationKey: ["credit-router", "quote"],
    mutationFn: (request: CreditQuoteRequest) => creditRouterClient.quote(request),
  });
  const relayMutation = useMutation({
    mutationKey: creditRelayMutationKey,
    mutationFn: async (current: Review) => {
      const health = await queryClient.fetchQuery(relayerHealthQueryOptions(relayerClient));
      if (!health.relayerAddress)
        throw new Error("Relayer health response is missing relayerAddress");
      if (!wallet) throw new Error("No wallet is connected to sign this transaction.");
      return relayCreditQuote(
        {
          quote: current.quote,
          request: current.request,
          reviewed: { amountIn: current.quote.amountIn, minAmountOut: current.quote.minAmountOut },
          wallet: getAddress(wallet),
          signer: current.signer,
          chainId: CHAIN_ID_BIGINT,
          caliburAddress: CALIBUR_ADDRESS,
          relayerAddress: getAddress(health.relayerAddress),
          nowSeconds: Math.floor(Date.now() / 1000),
        },
        relayerClient,
      );
    },
  });
  const relaying = useIsMutating({ mutationKey: creditRelayMutationKey }) > 0;

  const canQuote =
    !!wallet &&
    selectedOption?.state === "carries" &&
    !!sizedParams &&
    !amountDebouncing &&
    !sized.isFetching &&
    !relaying;

  const requestQuote = async () => {
    if (!canQuote || !selected || !sizedParams || !wallet) return;
    setProblem(null);
    quoteMutation.reset();
    relayMutation.reset();
    let signer: CaliburSigner;
    try {
      signer = resolveCaliburSigner(connector?.id, getAddress(wallet));
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
      return;
    }
    const request: CreditQuoteRequest = {
      route: creditRouteHopRefs(selected),
      mode,
      amount: sizedParams.amount,
      recipient: null,
      keyHash: signer.keyHash,
    };
    const quote = await quoteMutation.mutateAsync(request).catch(() => null);
    if (quote) {
      setRequoted(false);
      setReview({ request, quote, signer, route: selected });
    }
  };

  const confirm = async () => {
    if (!review || relaying) return;
    // An expired quote is asked again for the same request, never signed: its
    // deadline would fail the checks, and the terms may have moved.
    if (review.quote.expiresAt <= Math.floor(Date.now() / 1000) + QUOTE_EXPIRY_MARGIN_S) {
      relayMutation.reset();
      const fresh = await quoteMutation.mutateAsync(review.request).catch(() => null);
      setReview(fresh ? { ...review, quote: fresh } : null);
      setRequoted(fresh !== null);
      return;
    }
    setRequoted(false);
    const result = await relayMutation.mutateAsync(review).catch(() => null);
    if (!result) return;
    setReview(null);
    void queryClient.invalidateQueries({ queryKey: creditRouterKeys.wallet(wallet ?? "") });
    void navigate({
      to: "/routed-swaps/$trackingId",
      params: { trackingId: result.trackingId },
    });
  };

  const amountVoucher = mode === "exactOutput" ? targetAddress : selectedOption?.voucher;

  return {
    wallet,
    auth,
    target,
    targetLabel: labels.get(targetAddress.toLowerCase()),
    /** Raw units of the target the wallet already holds; absent when it holds none. */
    heldBalance: heldBalance && BigInt(heldBalance) > 0n ? heldBalance : undefined,
    mode,
    setMode: (next: CreditQuoteMode) => {
      if (next === mode) return;
      setMode(next);
      setAmount("");
      quoteMutation.reset();
    },
    amount,
    setAmount: (value: string) => setAmount(sanitizeSwapAmount(value)),
    amountDebouncing,
    amountRaw: sizedParams ? amountRaw : undefined,
    /** The voucher the amount is counted in: the target, or the voucher spent once there is one. */
    amountVoucher,

    options,
    fallbackPools: firstPage?.fallbackPools ?? [],
    asOfBlock: firstPage?.asOfBlock,
    stale: firstPage?.stale === true,
    routesPending: !!wallet && listing.isPending,
    routesFetching: active.isFetching,
    routesError: active.isError ? active.error : null,
    retryRoutes: () => void active.refetch(),
    hasMoreRoutes: active.hasNextPage === true,
    loadingMoreRoutes: active.isFetchingNextPage,
    loadMoreRoutes: () => void active.fetchNextPage(),

    /** The voucher paid with, lower case: the one picked, or the only one that can pay. */
    selectedVoucher: selectedOption?.voucher.toLowerCase() ?? null,
    selectVoucher: (voucher: string) => setChosenVoucher(voucher.toLowerCase()),
    /** Makes a route from "Other ways" its voucher's route, and pays with that voucher. */
    chooseRoute: (voucher: string, route: CreditRoute) => {
      const key = voucher.toLowerCase();
      setRouteChoices((choices) => ({ ...choices, [key]: creditRouteKey(route) }));
      setChosenVoucher(key);
    },
    /**
     * Fills the amount with the most an option's route takes, in the voucher
     * the amount is counted in, and pays with that voucher.
     */
    fillMax: (option: CreditPayOption) => {
      const raw = mode === "exactOutput" ? option.route.maxAmountOut : option.route.maxAmountIn;
      const decimals = decimalsOf(mode === "exactOutput" ? targetAddress : option.voucher);
      if (raw === null || decimals === null) return;
      setChosenVoucher(option.voucher.toLowerCase());
      setAmount(formatTokenAmountFixed(raw, decimals, 2));
    },
    selected,

    canQuote,
    requestQuote,
    quoting: quoteMutation.isPending,
    quoteError: quoteMutation.error,
    problem,

    review,
    /** The review was refreshed because its quote expired; the amounts may differ. */
    requoted,
    closeReview: () => {
      if (!relaying) setReview(null);
    },
    confirm,
    relaying,
    relayError: relayMutation.error,
  };
}

export type CreditGet = ReturnType<typeof useCreditGet>;
