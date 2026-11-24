import { queryOptions } from "@tanstack/react-query";
import { transientBackendReadQueryPolicy } from "../../client/errors";
import type { SafeClient } from "./client";

export const safeKeys = {
  all: ["clc", "safe"] as const,
  owner: (owner: string) => [...safeKeys.all, "owner", owner.toLowerCase()] as const,
  pending: (safe: string) => ["clc", "safe", "pending", safe.toLowerCase()] as const,
  mine: (account: string) => ["clc", "safe", "mine", account.toLowerCase()] as const,
};

/** Public ownership and message targets for one owner address. */
export function ownerInfoQueryOptions(client: SafeClient, owner: string | undefined) {
  return queryOptions({
    queryKey: safeKeys.owner(owner ?? "none"),
    queryFn: ({ signal }) => client.owner(owner!, signal),
    enabled: Boolean(owner),
    staleTime: 30_000,
  });
}

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
export function safePendingQueryOptions(
  client: SafeClient,
  safe: string | undefined,
  viewer: string | undefined,
) {
  return queryOptions({
    queryKey: [...safeKeys.pending(safe ?? "none"), viewer?.toLowerCase() ?? "none"] as const,
    queryFn: ({ signal }) => client.pending(safe!, signal),
    enabled: Boolean(safe && viewer),
    // Let bounded retries finish, then wait for Retry or reconnection after a
    // failure. In particular, repeating a denied read cannot recover access.
    refetchInterval: (query) => (query.state.status === "error" ? false : POLL_MS),
    staleTime: 0,
    ...transientBackendReadQueryPolicy,
  });
}
