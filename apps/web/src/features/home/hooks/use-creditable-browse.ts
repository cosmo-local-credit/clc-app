import type { CreditScope } from "@clc/api/features/credit-router/client";
import { creditReachQueryOptions } from "@clc/api/features/credit-router/queries";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { creditRouterClient } from "#/lib/api/credit-router";
import { CHAIN_ID } from "#/lib/chain";
import { parseCreditDepth, type PoolRouteSearch } from "#/lib/navigation/pool-search";

/**
 * The Credit filter, resolved by the server for the session wallet at the
 * depth the URL names: one pool hop, or up to two (depth 2 includes depth 1).
 * Guests have no Credit filter: the router needs a session.
 *
 * Every endpoint that narrows by Credit sends `scope` (`creditDepth`) and is
 * filtered before paging and clustering. `poolRefs` is the same reach as a
 * pool list, for the Pools page and for intersecting with an output voucher.
 * Both are keyed by wallet and depth, so cycling the depth can never show one
 * depth's answer as another's.
 */
export function useCreditableBrowse(value: PoolRouteSearch["creditDepth"]) {
  const auth = useAuthStatus();
  const parsed = parseCreditDepth(value);
  const depth = parsed.ok ? parsed.depth : null;
  const enabled = depth !== null;
  const wallet = enabled && auth.isAuthenticated ? (auth.address ?? "") : "";
  const reach = useQuery(creditReachQueryOptions(creditRouterClient, wallet, depth ?? 1));
  const ready = wallet !== "" && reach.isSuccess;

  const poolRefs = useMemo(
    () =>
      ready
        ? reach.data.pools.map((pool) => ({ chainId: CHAIN_ID, address: pool.address }))
        : undefined,
    [ready, reach.data],
  );
  const scope = useMemo<CreditScope | undefined>(
    () => (ready && depth !== null ? { depth, wallet, digest: reach.data.digest } : undefined),
    [ready, depth, wallet, reach.data],
  );

  return {
    auth,
    parsed,
    /** The selected depth, or null while Credit is off or the link is invalid. */
    depth,
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
