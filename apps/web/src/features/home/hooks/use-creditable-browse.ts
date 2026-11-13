import type { CreditDepth, CreditScope } from "@clc/api/features/credit-router/client";
import { creditReachQueryOptions } from "@clc/api/features/credit-router/queries";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { creditRouterClient } from "#/lib/api/credit-router";
import { CHAIN_ID } from "#/lib/chain";
import { parsePoolCreditable } from "#/lib/navigation/pool-search";

/**
 * How far the Credit filter reaches: anything the wallet's vouchers can buy
 * through one pool or two. Depth 2 includes depth 1.
 */
export const CREDIT_FILTER_DEPTH: CreditDepth = 2;

/**
 * The Credit filter, resolved by the server for the session wallet. Guests have
 * no Credit filter: the router needs a session.
 *
 * Endpoints that accept `creditDepth` (market map, marketplace, reports) send
 * `scope` and filter before paging and clustering. The others take `poolRefs`,
 * the same server-resolved reach as a pool list, so every screen narrows to
 * one set.
 */
export function useCreditableBrowse(
  value: boolean | string | readonly (boolean | string)[] | undefined,
) {
  const auth = useAuthStatus();
  const parsed = parsePoolCreditable(value);
  const enabled = parsed.ok && parsed.enabled === true;
  const wallet = enabled && auth.isAuthenticated ? (auth.address ?? "") : "";
  const reach = useQuery(creditReachQueryOptions(creditRouterClient, wallet, CREDIT_FILTER_DEPTH));
  const ready = wallet !== "" && reach.isSuccess;

  const poolRefs = useMemo(
    () =>
      ready
        ? reach.data.pools.map((pool) => ({ chainId: CHAIN_ID, address: pool.address }))
        : undefined,
    [ready, reach.data],
  );
  const scope = useMemo<CreditScope | undefined>(
    () => (ready ? { depth: CREDIT_FILTER_DEPTH, wallet, digest: reach.data.digest } : undefined),
    [ready, wallet, reach.data],
  );

  return {
    auth,
    parsed,
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
    blocksResults:
      !parsed.ok || (enabled && (!auth.isAuthenticated || !ready || poolRefs?.length === 0)),
  };
}
