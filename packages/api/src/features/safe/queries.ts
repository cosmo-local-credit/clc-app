import { mutationOptions, queryOptions } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type { ProposeSafeTransactionInput, SafeClient } from "./client";

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

export function proposeSafeTransactionMutationOptions(
  client: SafeClient,
  queryClient: QueryClient,
) {
  return mutationOptions({
    mutationFn: (input: ProposeSafeTransactionInput) => client.propose(input),
    onSuccess: async (proposal) => {
      queryClient.setQueryData(safeKeys.transaction(proposal.safeTxHash), proposal);
      await queryClient.invalidateQueries({ queryKey: safeKeys.pending(proposal.safe) });
    },
  });
}

export function confirmSafeTransactionMutationOptions(
  client: SafeClient,
  queryClient: QueryClient,
) {
  return mutationOptions({
    mutationFn: (input: { safeTxHash: string; signature: `0x${string}` }) =>
      client.confirm(input.safeTxHash, input.signature),
    onSuccess: async (proposal) => {
      queryClient.setQueryData(safeKeys.transaction(proposal.safeTxHash), proposal);
      await queryClient.invalidateQueries({ queryKey: safeKeys.pending(proposal.safe) });
    },
  });
}
