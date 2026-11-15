import type { CreditScope } from "@clc/api/features/credit-router/client";
import { creditReachQueryOptions } from "@clc/api/features/credit-router/queries";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { creditRouterClient } from "#/lib/api/credit-router";
import { CHAIN_ID } from "#/lib/chain";

/**
 * The Credit filter, resolved by the server for the session wallet: every pool
 * its vouchers reach, as far as the router routes. Guests have no Credit
 * filter: the router needs a session.
 *
 * Every endpoint that narrows by Credit sends `scope` (`creditDepth=max`) and
 * is filtered before paging and clustering. `poolRefs` is the same reach as a
 * pool list, for the Pools page and for intersecting with an output voucher.
 * Both are keyed by wallet and reach digest, and read the one reach the swap
 * counts read, so turning Credit on asks the router nothing new.
 */
export function useCreditableBrowse(enabled: boolean) {
  const auth = useAuthStatus();
  const wallet = enabled && auth.isAuthenticated ? (auth.address ?? "") : "";
  const reach = useQuery(creditReachQueryOptions(creditRouterClient, wallet));
  const ready = wallet !== "" && reach.isSuccess;

  const poolRefs = useMemo(
    () =>
      ready
        ? reach.data.pools.map((pool) => ({ chainId: CHAIN_ID, address: pool.address }))
        : undefined,
    [ready, reach.data],
  );
  const scope = useMemo<CreditScope | undefined>(
    () => (ready ? { wallet, digest: reach.data.digest } : undefined),
    [ready, wallet, reach.data],
  );

  return {
    auth,
    /** Credit is on in the URL. */
    enabled,
    verification: {
      status: ready ? "ready" : reach.isError ? "error" : "loading",
      isRefreshing: ready && reach.isFetching,
      /** Served from an older graph: the reach is an estimate and may have moved. */
      stale: ready && reach.data.stale,
      retry: () => void reach.refetch(),
      retrying: reach.isFetching,
    } as const,
    /** The reachable pools, for endpoints that take a pool list rather than `creditDepth`. */
    poolRefs,
    /** The server-resolved filter for endpoints that accept `creditDepth`. */
    scope,
    blocksResults: enabled && (!auth.isAuthenticated || !ready || poolRefs?.length === 0),
  };
}
