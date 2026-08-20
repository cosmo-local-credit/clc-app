import type { WebAuthnCredential } from "@clc/core/features/webauthn/index";
import { privateKeyToAccount } from "viem/accounts";
import { create } from "zustand";

/**
 * The signing key the operator brought to this tab.
 *
 * **Deliberately not persisted.** The console's session survives a reload
 * because clc-core sets an HttpOnly cookie, and that cookie authorises reads —
 * it cannot sign anything. Signing needs the key itself, and a superadmin key
 * left in `localStorage` on a shared back-office desktop is a different bargain
 * from the one apps/web makes on a personal phone. So this store lives in memory
 * for the tab: an operator signs several transactions without re-authenticating,
 * and a reload asks for the paper wallet again.
 *
 * A passkey holds no secret here at all. The stored record is the public half —
 * address, key hash, credential id — which is what the relayer needs to build a
 * batch; the private key never leaves the authenticator, and every signature
 * prompts.
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

export const useOperatorKeyStore = create<OperatorKeyState>((set) => ({
  key: null,
  adoptPrivateKey: (privateKey) =>
    set({
      key: {
        kind: "privateKey",
        // Derived once here so every later check compares against the key that
        // was actually loaded rather than against whatever the session claims.
        address: privateKeyToAccount(privateKey).address,
        privateKey,
      },
    }),
  adoptPasskey: (credential) => set({ key: { kind: "passkey", credential } }),
  clear: () => set({ key: null }),
}));

/** Reads outside React — the relay path is a plain async function, not a hook. */
export function getOperatorKey(): OperatorKey | null {
  return useOperatorKeyStore.getState().key;
}
