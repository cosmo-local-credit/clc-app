import { mySafesQueryOptions, safeKeys } from "@clc/api/features/safe/queries";
import {
  buildSafeSignerChangeCall,
  type SafeSignerChangeRequest,
  type SafeSignerState,
} from "@clc/core/features/safe/logic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { Client } from "viem";
import { useClient } from "wagmi";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import {
  assetOwnerInfoKey,
  assetOwnerProjectionKey,
  readAssetOwnerInfo,
} from "#/features/ownership/hooks/use-asset-owner-info";
import { safeClient } from "#/lib/api/safe";
import { CHAIN_ID } from "#/lib/chain";
import { SAFE_OWNERSHIP_ENABLED } from "#/lib/safe-config";
import { useSafeWrite } from "./use-safe-write";

/**
 * How often a shown signer set is re-read. A signer change can execute in
 * Safe, out of this app's sight, so nothing here would otherwise notice it.
 */
const SIGNER_SET_POLL_MS = 15_000;

export const safeSignersKey = (safe: string) =>
  ["safe-signers", CHAIN_ID, safe.toLowerCase()] as const;

/** The multisigs the signed-in account signs for. Empty while the feature is off. */
export function useMySafes() {
  const auth = useAuthStatus();
  const account = auth.isAuthenticated ? auth.session?.address : undefined;
  return useQuery({
    ...mySafesQueryOptions(safeClient, account),
    enabled: SAFE_OWNERSHIP_ENABLED && Boolean(account),
    refetchInterval: SIGNER_SET_POLL_MS,
  });
}

/**
 * Re-reads everything derived from a Safe's signer set: the multisigs the
 * account signs for, the Safe's signers, and who may sign for what it owns.
 * Called when a transaction leaves the Safe's queue, since an executed signer
 * change can add or drop the Safe from Settings.
 */
export function useRefreshSafeSigners() {
  const queryClient = useQueryClient();
  return useCallback(
    (safe: string) =>
      Promise.all(
        [
          [...safeKeys.all, "mine"],
          safeSignersKey(safe),
          assetOwnerInfoKey(safe),
          assetOwnerProjectionKey(safe),
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
    [queryClient],
  );
}

/**
 * A Safe's signers in its own `getOwners` order and its threshold, read from
 * chain. The projection sorts signers by address, and a removal must name the
 * signer's real predecessor.
 */
async function readSignerState(client: Client, safe: `0x${string}`): Promise<SafeSignerState> {
  const info = await readAssetOwnerInfo(client, safe);
  if (info.kind !== "safe" || info.threshold === null)
    throw new Error("This multisig's signers could not be read.");
  return { safe, owners: info.signers, threshold: info.threshold };
}

export function useSafeSigners(safe: `0x${string}`, enabled: boolean) {
  const client = useClient({ chainId: CHAIN_ID });
  return useQuery({
    queryKey: safeSignersKey(safe),
    queryFn: () => readSignerState(client!, safe),
    enabled: enabled && Boolean(client),
    staleTime: SIGNER_SET_POLL_MS,
    refetchInterval: SIGNER_SET_POLL_MS,
    retry: false,
  });
}

/**
 * Proposes a signer or threshold change to the Safe's queue. The signers are
 * read again at the moment of proposing, so the call matches the list the Safe
 * will check. Like every Safe write, success surfaces as SafeProposedError.
 */
export function useProposeSignerChange(safe: `0x${string}`) {
  const client = useClient({ chainId: CHAIN_ID });
  const { write } = useSafeWrite();
  return useMutation({
    mutationFn: async (change: SafeSignerChangeRequest) => {
      if (!client) throw new Error("The configured chain is unavailable.");
      const state = await readSignerState(client, safe);
      return write({ safe, calls: [buildSafeSignerChangeCall(state, change)] });
    },
  });
}
