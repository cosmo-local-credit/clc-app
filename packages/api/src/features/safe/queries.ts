import { queryOptions } from "@tanstack/react-query";
import type { SafeClient } from "./client";

export const safeKeys = {
  all: ["clc", "safe"] as const,
  pending: (safe: string) => ["clc", "safe", "pending", safe.toLowerCase()] as const,
  mine: (account: string) => ["clc", "safe", "mine", account.toLowerCase()] as const,
};

/** The multisigs `account`, the signed-in session, signs for. */
export function mySafesQueryOptions(client: SafeClient, account: string | undefined) {
  return queryOptions({
    queryKey: safeKeys.mine(account ?? "none"),
    queryFn: ({ signal }) => client.mine(signal),
    enabled: Boolean(account),
    staleTime: 30_000,
  });
}

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
