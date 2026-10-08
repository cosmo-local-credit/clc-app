import { type CollectSession, INITIAL_COLLECT_SESSION } from "@clc/core/features/nfc/collect";
import { create } from "zustand";

type CollectSessionState = {
  session: CollectSession;
  /**
   * Applies a pure transition from `@clc/core/features/nfc/collect` in one
   * synchronous `set`. Callers that need the transition's verdict compute it
   * from `getState().session` and pass the resulting session here in the same
   * tick, which is what makes a duplicate tag event find its intent claimed.
   */
  apply: (transition: (session: CollectSession) => CollectSession) => void;
  reset: () => void;
};

/**
 * The public half of card collection: the armed intent, the same-wallet latch
 * and which payers have a payment unresolved. No key ever enters it.
 */
export const useCollectSession = create<CollectSessionState>()((set) => ({
  session: INITIAL_COLLECT_SESSION,
  apply: (transition) => set((state) => ({ session: transition(state.session) })),
  reset: () => set({ session: INITIAL_COLLECT_SESSION }),
}));
