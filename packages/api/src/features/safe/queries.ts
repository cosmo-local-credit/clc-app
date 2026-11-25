import { queryOptions } from "@tanstack/react-query";
import { BackendApiError, transientBackendReadQueryPolicy } from "../../client/errors";
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

const POLL_MS = 30_000;
// Match the backend's cooldown when Safe has not provided a reset time.
const UNKNOWN_QUOTA_COOLDOWN_MS = 3_600_000;

export function isSafeMonthlyQuotaError(
  error: unknown,
): error is BackendApiError & { code: "E29" } {
  return error instanceof BackendApiError && error.code === "E29";
}

/** Poll visible, nonempty queues for confirmations from other signers. */
export function safePendingQueryOptions(
  client: SafeClient,
  safe: string | undefined,
  viewer: string | undefined,
) {
  return queryOptions({
    queryKey: [...safeKeys.pending(safe ?? "none"), viewer?.toLowerCase() ?? "none"] as const,
    queryFn: ({ signal }) => client.pending(safe!, signal),
    enabled: ({ state }) =>
      Boolean(safe && viewer) &&
      (!isSafeMonthlyQuotaError(state.error) ||
        Date.now() >=
          state.errorUpdatedAt + (state.error.retryAfterMs ?? UNKNOWN_QUOTA_COOLDOWN_MS)),
    refetchInterval: ({ state }) =>
      state.status === "success" && state.data?.length ? POLL_MS : false,
    refetchIntervalInBackground: false,
    staleTime: 0,
    ...transientBackendReadQueryPolicy,
    retry: (failureCount, error) =>
      !isSafeMonthlyQuotaError(error) && transientBackendReadQueryPolicy.retry(failureCount, error),
  });
}
