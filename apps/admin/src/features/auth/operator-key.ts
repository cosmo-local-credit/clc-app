import type { WebAuthnCredential } from "@clc/core/features/webauthn/index";
import { privateKeyToAccount } from "viem/accounts";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * The signing key the operator brought to the console.
 *
 * Paper-wallet keys follow apps/web's UX bargain: after SIWE succeeds, the raw
 * key is kept in `localStorage` so a reload can keep signing without asking the
 * operator to upload the wallet again. Explicit sign-out clears it.
 *
 * A passkey follows a different lifecycle and remains memory-only. Its record is
 * the public half — address, key hash, credential id — which is what the relayer
 * needs to build a batch; the private key never leaves the authenticator, and
 * every signature prompts.
 */

export type OperatorKey =
  | { kind: "privateKey"; address: `0x${string}`; privateKey: `0x${string}` }
  | { kind: "passkey"; credential: WebAuthnCredential };

type OperatorKeyState = {
  key: OperatorKey | null;
  adoptPrivateKey: (privateKey: `0x${string}`) => void;
  adoptPasskey: (credential: WebAuthnCredential) => void;
  clear: () => void;
};

type PersistedOperatorKeyState = {
  key: Extract<OperatorKey, { kind: "privateKey" }> | null;
};

export const useOperatorKeyStore = create<OperatorKeyState>()(
  persist(
    (set) => ({
      key: null,
      adoptPrivateKey: (privateKey) =>
        set({
          key: {
            kind: "privateKey",
            // Derived once here so every later check compares against the key
            // that was actually loaded rather than whatever a caller claims.
            address: privateKeyToAccount(privateKey).address,
            privateKey,
          },
        }),
      adoptPasskey: (credential) => set({ key: { kind: "passkey", credential } }),
      clear: () => set({ key: null }),
    }),
    {
      name: "clc.admin.operator-key",
      // Persist only the paper-wallet signer. A passkey record is reconstructed
      // after its own authentication flow and must not hitch a ride here.
      partialize: (state): PersistedOperatorKeyState => ({
        key: state.key?.kind === "privateKey" ? state.key : null,
      }),
    },
  ),
);

/** Reads outside React — the relay path is a plain async function, not a hook. */
export function getOperatorKey(): OperatorKey | null {
  return useOperatorKeyStore.getState().key;
}
