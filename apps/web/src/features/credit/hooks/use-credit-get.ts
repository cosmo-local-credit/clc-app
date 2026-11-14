import {
  type CreditQuote,
  type CreditQuoteRequest,
  type CreditRoute,
  creditRouterFailure,
} from "@clc/api/features/credit-router/client";
import {
  creditRouterKeys,
  creditRoutesInfiniteQueryOptions,
} from "@clc/api/features/credit-router/queries";
import { createRelayerClient } from "@clc/api/features/relayer/client";
import { relayerHealthQueryOptions } from "@clc/api/features/relayer/queries";
import type { CreditQuoteMode } from "@clc/core/features/credit-router/logic";
import { parseTokenAmount } from "@clc/core/features/wallet/logic";
import {
  keepPreviousData,
  useInfiniteQuery,
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getAddress } from "viem";
import { useConnection } from "wagmi";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { relayCreditQuote } from "#/features/credit/api/relay-credit-quote";
import {
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
 * Obtaining one voucher through as many pools as the router routes: the routes
 * from the wallet's vouchers, an amount to get (exact output, the default) or
 * to spend (exact input), the authoritative quote, its review, and the
 * checked, self-signed relay.
 */
export function useCreditGet(targetAddress: `0x${string}`) {
  const auth = useAuthStatus();
  const { connector } = useConnection();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const wallet = auth.isAuthenticated ? auth.address : undefined;

  const [mode, setMode] = useState<CreditQuoteMode>("exactOutput");
  const [amount, setAmount] = useState("");
  const [fromVoucher, setFromVoucher] = useState<`0x${string}` | undefined>(undefined);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
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

  // The voucher the amount is counted in: the one obtained, or the one spent.
  const spendVoucher =
    fromVoucher ?? (mode === "exactInput" ? listingGroups[0]?.voucher : undefined);
  const labels = useVoucherLabels([targetAddress, ...(spendVoucher ? [spendVoucher] : [])]);
  const amountDecimals =
    mode === "exactOutput"
      ? (target?.decimals ?? labels.get(targetAddress.toLowerCase())?.decimals ?? null)
      : spendVoucher
        ? (labels.get(spendVoucher.toLowerCase())?.decimals ?? null)
        : null;
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

  const sizedParams =
    amountRaw && (mode === "exactOutput" || spendVoucher)
      ? {
          ...listingParams,
          amount: amountRaw,
          mode,
          ...(mode === "exactInput" && spendVoucher ? { from: spendVoucher } : {}),
        }
      : null;
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
  const groups = useMemo(
    () => (sizedParams ? mergeCreditRouteGroups(sized.data?.pages) : listingGroups),
    [sizedParams, sized.data?.pages, listingGroups],
  );
  const firstPage = active.data?.pages[0];
  const selected = useMemo(() => {
    for (const group of groups) {
      for (const route of group.routes) {
        if (creditRouteKey(route) === selectedKey) return route;
      }
    }
    return undefined;
  }, [groups, selectedKey]);

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
    !!selected &&
    !!sizedParams &&
    !amountDebouncing &&
    !sized.isFetching &&
    selected.carriesAmount !== false &&
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

  return {
    wallet,
    auth,
    target,
    targetLabel: labels.get(targetAddress.toLowerCase()),
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
    spendVoucher,
    spendLabel: spendVoucher ? labels.get(spendVoucher.toLowerCase()) : undefined,
    chooseSpendVoucher: (voucher: `0x${string}`) => {
      setFromVoucher(voucher);
      setSelectedKey(null);
    },
    /** Every input voucher that has a route, for choosing what to spend. */
    inputVouchers: listingGroups.map((group) => ({
      voucher: group.voucher,
      walletBalance: group.walletBalance,
    })),

    groups,
    fallbackPools: firstPage?.fallbackPools ?? [],
    asOfBlock: firstPage?.asOfBlock,
    stale: firstPage?.stale === true,
    routesPending: !!wallet && active.isPending,
    routesFetching: active.isFetching,
    routesError: active.isError ? active.error : null,
    retryRoutes: () => void active.refetch(),
    hasMoreRoutes: active.hasNextPage === true,
    loadingMoreRoutes: active.isFetchingNextPage,
    loadMoreRoutes: () => void active.fetchNextPage(),

    selectedKey,
    selectRoute: (route: CreditRoute) => {
      setSelectedKey(creditRouteKey(route));
      if (mode === "exactInput") setFromVoucher(route.hops[0]!.tokenIn);
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
