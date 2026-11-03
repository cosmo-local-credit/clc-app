import { BackendApiError } from "@clc/api/client/errors";
import type { MovedPasskey } from "@clc/api/features/auth/client";
import { authKeys } from "@clc/api/features/auth/queries";
import { createRelayerClient } from "@clc/api/features/relayer/client";
import { planKeyRotationBatches } from "@clc/core/features/key-rotation/logic";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { privateKeyToAccount } from "viem/accounts";
import { connect, disconnect } from "wagmi/actions";

import { storePrivateKey } from "#/connectors/privateKey";
import { clearIdentitySecrets } from "#/features/auth/api/identity-reset";
import { authSessionQueryKey } from "#/features/auth/hooks/use-auth-status";
import { authClient } from "#/lib/api/auth";
import { CHAIN_ID } from "#/lib/chain";
import { RELAYER_URL } from "#/lib/relayer-config";
import { moveOwnerTier } from "#/lib/storage/owner-tier-registry";
import { beginWalletSwitch } from "#/lib/wallet-session";
import { pkConnector, wagmiConfig } from "#/providers/web3-config";

import { loadRotationAssets } from "../api/load-rotation-assets";
import { relinkPasskey } from "../api/relink-passkey";
import { replaceSignInCard } from "../api/replace-sign-in-card";
import { runRotationBatches } from "../api/run-rotation-batches";
import { useRotationSession } from "../state/rotation-session";

const relayerClient = createRelayerClient(RELAYER_URL);

export const keyRotationKeys = {
  assets: (from: string, to: string) =>
    ["clc", "key-rotation", "assets", from.toLowerCase(), to.toLowerCase()] as const,
};

/** What would move, for the review screen. Read fresh again before moving. */
export function useRotationAssets(from: `0x${string}` | null, to: `0x${string}` | null) {
  return useQuery({
    queryKey: keyRotationKeys.assets(from ?? "none", to ?? "none"),
    queryFn: () => {
      if (!from || !to) throw new Error("No sign-in card to replace.");
      return loadRotationAssets(from, to);
    },
    enabled: Boolean(from && to),
    staleTime: 30_000,
    retry: false,
  });
}

/**
 * Moves the account to the new card, then this device's session with it.
 *
 * A mutation, so the update banner holds its reload while it runs. `proof`
 * says how the old card confirms: with its own signature, or with the
 * account's passkey, which clc-core requires whenever one is active. A card
 * proof refused for that reason is retried once with the passkey, for a
 * passkey added since the screen loaded.
 */
export function useSwitchToNewCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["key-rotation", "switch"],
    mutationFn: async (proof: "card" | "passkey") => {
      const session = useRotationSession.getState();
      const { oldAddress, newAddress, newKey, oldSigner } = session;
      if (!oldAddress || !newAddress || !newKey || !oldSigner) {
        throw new Error("Start the replacement again from Settings.");
      }
      const siwe = { domain: window.location.host, uri: window.location.origin, chainId: CHAIN_ID };
      const replace = (kind: "card" | "passkey") =>
        replaceSignInCard({
          auth: authClient,
          relayer: relayerClient,
          oldAddress,
          newKey,
          proof:
            kind === "card" && oldSigner.kind === "card"
              ? { kind: "card", key: oldSigner.key }
              : { kind: "passkey" },
          siwe,
        });

      let result;
      try {
        result = await replace(proof);
      } catch (error) {
        if (!(proof === "card" && error instanceof BackendApiError && error.status === 403)) {
          throw error;
        }
        result = await replace("passkey");
      }
      session.setMovedPasskeys(result.movedPasskeys);
      await switchSession(queryClient, newKey, oldAddress, newAddress);
      session.setStep("moving");
      return result;
    },
  });
}

/**
 * Points this device at the new card. Mirrors the `?w=` switch in `__root.tsx`:
 * the outgoing connector is dropped before the new key is written, and a
 * sign-out that wins the race leaves no credential behind.
 */
async function switchSession(
  queryClient: QueryClient,
  newKey: `0x${string}`,
  oldAddress: `0x${string}`,
  newAddress: `0x${string}`,
) {
  const signal = beginWalletSwitch();
  // Before the session query flips, so the identity transition finds the
  // person's address book and filters already under the new card.
  moveOwnerTier(oldAddress.toLowerCase(), newAddress.toLowerCase());
  // "private-key", not "none": the replacement still holds the old card's key
  // in memory to move what it owns.
  clearIdentitySecrets("private-key");
  try {
    await disconnect(wagmiConfig);
  } catch {
    // The outgoing connector's own cleanup; connect below reports a stuck one.
  }
  storePrivateKey(newKey);
  await connect(wagmiConfig, { connector: pkConnector });
  if (signal.aborted) {
    clearIdentitySecrets("none");
    try {
      await disconnect(wagmiConfig);
    } catch {
      // Credentials are already gone.
    }
    throw new Error("Signed out while switching to the new card.");
  }
  await queryClient.invalidateQueries({ queryKey: authSessionQueryKey, refetchType: "all" });
}

/**
 * Plans from chain state and moves it, as the old wallet, to the new one.
 * Progress and the outcome go to the session store, not the mutation: the page
 * can remount while this runs.
 */
export function useMoveOldCardAssets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["key-rotation", "move"],
    mutationFn: async () => {
      const session = useRotationSession.getState();
      const { oldAddress, newAddress, oldSigner } = session;
      if (!oldAddress || !newAddress || !oldSigner) {
        throw new Error("Scan the old sign-in card to continue.");
      }
      session.setMoveOutcome(null);
      const assets = await loadRotationAssets(oldAddress, newAddress);
      const batches = planKeyRotationBatches(assets.groups);
      try {
        const run = await runRotationBatches({
          batches,
          from: oldAddress,
          signer: oldSigner,
          relayer: relayerClient,
          onProgress: (current, state) =>
            session.setMoveProgress({ total: batches.length, current, state }),
        });
        session.setMoveOutcome({ batches, ...run, skipped: assets.skipped });
      } finally {
        session.setMoveProgress(null);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["clc"] }),
  });
}

/**
 * Registers passkeys that came along on the new card's wallet. `key` is the
 * new card's: from the replacement in memory, or the stored key of a session
 * signed in with that card afterwards.
 */
export function useRelinkPasskeys() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["key-rotation", "passkeys"],
    mutationFn: async (input: { passkeys: MovedPasskey[]; key: `0x${string}` }) => {
      for (const passkey of input.passkeys) {
        await relinkPasskey({ passkey, newKey: input.key, relayer: relayerClient });
      }
      return privateKeyToAccount(input.key).address;
    },
    onSettled: (address) =>
      address
        ? queryClient.invalidateQueries({ queryKey: authKeys.webAuthnCredentials(address) })
        : undefined,
  });
}
