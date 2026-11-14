import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import { transientBackendReadQueryPolicy } from "../../client/errors";
import type { CreditRouterClient, CreditRoutesParams, CreditScope } from "./client";

/** A Credit filter's cache identity: never shared across wallets or reach changes. */
export function creditScopeKey(scope: CreditScope | undefined) {
  return scope ? { wallet: scope.wallet.toLowerCase(), digest: scope.digest.toLowerCase() } : null;
}

/**
 * Every key carries the wallet: the router answers privately for the session
 * wallet, and a cache shared across a sign-out would show one wallet another's
 * reach.
 */
export const creditRouterKeys = {
  all: ["clc", "credit-router"] as const,
  wallet: (wallet: string) => ["clc", "credit-router", wallet.toLowerCase()] as const,
  reach: (wallet: string) => ["clc", "credit-router", wallet.toLowerCase(), "reach"] as const,
  routes: (wallet: string, params: Omit<CreditRoutesParams, "cursor">) =>
    [
      "clc",
      "credit-router",
      wallet.toLowerCase(),
      "routes",
      {
        to: params.to.toLowerCase(),
        from: params.from?.toLowerCase() ?? null,
        amount: params.amount ?? null,
        mode: params.amount ? (params.mode ?? "exactInput") : null,
      },
    ] as const,
  routedSwaps: (wallet: string) =>
    ["clc", "credit-router", wallet.toLowerCase(), "routed-swaps"] as const,
  routedSwap: (wallet: string, trackingId: string) =>
    ["clc", "credit-router", wallet.toLowerCase(), "routed-swaps", trackingId] as const,
};

/**
 * The reach estimate at the router's maximum depth, one per wallet: the Credit
 * filter and every swap count read it. Disabled for a guest: the endpoint
 * needs a session. `router_unavailable` (503) is retried like any server fault
 * and surfaces as an error, never as an empty reach.
 */
export function creditReachQueryOptions(client: CreditRouterClient, wallet: string) {
  return queryOptions({
    queryKey: creditRouterKeys.reach(wallet),
    queryFn: ({ signal }) => client.reach(signal),
    enabled: !!wallet,
    staleTime: 30_000,
    ...transientBackendReadQueryPolicy,
  });
}

/** Routes to one voucher, paged by the router's cursor. */
export function creditRoutesInfiniteQueryOptions(
  client: CreditRouterClient,
  wallet: string,
  params: Omit<CreditRoutesParams, "cursor">,
) {
  return infiniteQueryOptions({
    queryKey: creditRouterKeys.routes(wallet, params),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => client.routes({ ...params, cursor: pageParam }, signal),
    getNextPageParam: (page) => page.cursor ?? undefined,
    enabled: !!wallet && !!params.to,
    staleTime: 15_000,
    ...transientBackendReadQueryPolicy,
  });
}

/** The wallet's grouped receipts, newest first. */
export function routedSwapsInfiniteQueryOptions(client: CreditRouterClient, wallet: string) {
  return infiniteQueryOptions({
    queryKey: creditRouterKeys.routedSwaps(wallet),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => client.routedSwaps(pageParam, signal),
    getNextPageParam: (page) => page.cursor ?? undefined,
    enabled: !!wallet,
    ...transientBackendReadQueryPolicy,
  });
}

const RECEIPT_POLL_MS = 4_000;

/** One grouped receipt, polled until every hop has settled. */
export function routedSwapQueryOptions(
  client: CreditRouterClient,
  wallet: string,
  trackingId: string,
) {
  return queryOptions({
    queryKey: creditRouterKeys.routedSwap(wallet, trackingId),
    queryFn: ({ signal }) => client.routedSwap(trackingId, signal),
    enabled: !!wallet && !!trackingId,
    refetchInterval: (query) => {
      const receipt = query.state.data;
      if (!receipt) return RECEIPT_POLL_MS;
      const failed =
        receipt.swap.status !== null &&
        receipt.swap.status !== "SUCCESS" &&
        receipt.swap.status !== "PENDING" &&
        receipt.swap.status !== "IN_NETWORK";
      return receipt.settled || failed ? false : RECEIPT_POLL_MS;
    },
    ...transientBackendReadQueryPolicy,
  });
}
