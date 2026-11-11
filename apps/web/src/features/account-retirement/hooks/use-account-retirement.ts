import type { AccountLifecycleState } from "@clc/core/features/account-retirement/logic";
import { accountRetirementPreviewQueryOptions } from "@clc/api/features/account-retirement/queries";
import type { SessionResult } from "@clc/api/features/auth/client";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useConnection } from "wagmi";

import { clearInMemoryDrafts, clearScopedQueries } from "#/features/auth/api/identity-reset";
import { authSessionQueryKey } from "#/features/auth/hooks/use-auth-status";
import { accountRetirementClient } from "#/lib/api/account-retirement";

/**
 * The lifecycle the server just answered with, written into the session the
 * shell reads. The retire and restore responses are authoritative, so the app
 * switches shells at once instead of waiting on a second round trip that could
 * fail and leave a retired account looking active.
 *
 * Only the session of the wallet that made the request is touched: a response
 * that arrives after switching accounts describes the old wallet, and writing
 * it onto the new one would send an active account into recovery or mark a
 * retired one active.
 */
function applyLifecycle(queryClient: QueryClient, wallet: string, next: AccountLifecycleState) {
  queryClient.setQueriesData<SessionResult | null>({ queryKey: authSessionQueryKey }, (session) =>
    session && session.address.toLowerCase() === wallet.toLowerCase()
      ? {
          ...session,
          accountLifecycle: next.accountLifecycle,
          closesAt: next.closesAt,
          capabilities: next.capabilities,
          ...(next.accountLifecycle === "ACTIVE" ? {} : { role: "USER" }),
        }
      : session,
  );
}

/**
 * Drops every cached read made under the previous lifecycle. Retiring hides the
 * account's public content and restoring brings it back, so what was fetched
 * before either is wrong for the other. The session query is outside the sweep.
 */
function dropLifecycleScopedCaches(queryClient: QueryClient) {
  clearScopedQueries(queryClient);
  clearInMemoryDrafts();
}

/** What retiring would hide and leave in place, read only while the sheet is open. */
export function useAccountRetirementPreview(enabled: boolean) {
  const { address } = useConnection();
  return useQuery({
    ...accountRetirementPreviewQueryOptions(accountRetirementClient, address ?? ""),
    enabled: enabled && !!address,
  });
}

/**
 * A retire or restore that remembers which wallet asked. The wallet is read when
 * the caller invokes it, not when the request starts or answers, so a switch
 * made while the request is in flight cannot change whose session it updates.
 */
function useLifecycleMutation<TArg>(run: (arg: TArg) => Promise<AccountLifecycleState>) {
  const queryClient = useQueryClient();
  const { address } = useConnection();
  const current = useRef(address);
  current.current = address;
  const mutation = useMutation({
    mutationFn: async ({ arg }: { arg: TArg; wallet: string | undefined }) => run(arg),
    onSuccess: async (next, { wallet }) => {
      if (wallet) applyLifecycle(queryClient, wallet, next);
      // A switch of wallet already cleared the previous account's caches; doing
      // it again would wipe the new account's.
      if (wallet && current.current?.toLowerCase() === wallet.toLowerCase()) {
        dropLifecycleScopedCaches(queryClient);
      }
      await queryClient.invalidateQueries({ queryKey: authSessionQueryKey });
    },
  });
  return {
    ...mutation,
    mutate: (arg: TArg, options?: Parameters<typeof mutation.mutate>[1]) =>
      mutation.mutate({ arg, wallet: address }, options),
    mutateAsync: (arg: TArg, options?: Parameters<typeof mutation.mutateAsync>[1]) =>
      mutation.mutateAsync({ arg, wallet: address }, options),
  };
}

/** Retires the signed-in account. An empty reason is not sent. */
export function useRetireAccount() {
  return useLifecycleMutation((reason: string) => {
    const trimmed = reason.trim();
    return accountRetirementClient.retire({
      acknowledged: true,
      ...(trimmed ? { reason: trimmed } : {}),
    });
  });
}

/** Restores a retiring account before its closing date. */
export function useRestoreAccount() {
  return useLifecycleMutation((_: void) => accountRetirementClient.restore());
}
