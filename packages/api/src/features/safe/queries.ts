import { queryOptions } from "@tanstack/react-query";
import type { SafeClient } from "./client";

export const safeKeys = {
  all: ["clc", "safe"] as const,
  pending: (safe: string) => ["clc", "safe", "pending", safe.toLowerCase()] as const,
  transaction: (safeTxHash: string) => ["clc", "safe", "transaction", safeTxHash] as const,
};

const POLL_MS = 5_000;

/** Queued transactions of one Safe. Confirmations arrive from other signers, so it polls. */
export function safePendingQueryOptions(client: SafeClient, safe: string | undefined) {
  return queryOptions({
    queryKey: safeKeys.pending(safe ?? "none"),
    queryFn: ({ signal }) => client.pending(safe!, signal),
    enabled: Boolean(safe),
    refetchInterval: POLL_MS,
    staleTime: 0,
  });
}

/**
 * One transaction's confirmations and execution state. `refetchInterval` stops
 * once the transaction executed: the chain is the truth after that and nothing
 * on the service side changes.
 */
export function safeTransactionQueryOptions(client: SafeClient, safeTxHash: string | undefined) {
  return queryOptions({
    queryKey: safeKeys.transaction(safeTxHash ?? "none"),
    queryFn: ({ signal }) => client.transaction(safeTxHash!, signal),
    enabled: Boolean(safeTxHash),
    refetchInterval: (query) => (query.state.data?.isExecuted ? false : POLL_MS),
    staleTime: 0,
  });
}
