import { privateKeyToAccount } from "viem/accounts";
import { create } from "zustand";

type CollectPayerKeyState = {
  /** Whose key is held. Public, and the only field a component may select. */
  payer: `0x${string}` | null;
  /**
   * The scanned payer's private key. Never select it into a component: read it
   * with `getState()` at the moment of signing.
   */
  key: `0x${string}` | null;
  retain: (key: `0x${string}`) => `0x${string}`;
  clear: () => void;
};

/**
 * Custody of a card-collection payer's key, for the life of one collection
 * session.
 *
 * Kept so a collector can take several payments from the same card without a
 * fresh tap each time. That is also its exposure: while it holds a key, the
 * collector's device can sign for the payer's whole balance, so the only guard
 * against a second charge is the armed-intent rule, never the card's absence.
 *
 * Deliberately memory-only: no `persist`, no `devtools`, no storage of any
 * kind, never React state or a query cache. Cleared on sign-out, on leaving
 * the collect route, on reset and on "Done with this customer". Dropping the
 * reference bounds retention; it does not zero JavaScript memory.
 */
export const useCollectPayerKey = create<CollectPayerKeyState>()((set) => ({
  payer: null,
  key: null,
  retain: (key) => {
    const payer = privateKeyToAccount(key).address;
    set({ payer, key });
    return payer;
  },
  clear: () => set({ payer: null, key: null }),
}));
