import type { MovedPasskey } from "@clc/api/features/auth/client";
import type { RotationBatch } from "@clc/core/features/key-rotation/logic";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { create } from "zustand";

import type { LabelledRotationGroup, SkippedAsset } from "../api/discover-rotation-assets";
import type { BatchProgress } from "../api/run-rotation-batches";

/** What signs the old wallet's batches once the session has moved on. */
export type OldCardSigner =
  | { kind: "card"; key: `0x${string}` }
  | { kind: "passkey"; credentialId: string; keyHash: `0x${string}` };

export type RotationStep = "review" | "card" | "verify" | "moving" | "passkeys" | "done";

type MoveProgress = { total: number; current: number; state: BatchProgress };

/** What a move run did, kept here so a remount mid-run still shows it. */
type MoveOutcome = {
  batches: RotationBatch<LabelledRotationGroup>[];
  moved: number[];
  failed: number[];
  uncertainTrackingId: string | null;
  skipped: SkippedAsset[];
};

type RotationSessionState = {
  /** Public fields; the only ones a component may select. */
  oldAddress: `0x${string}` | null;
  newAddress: `0x${string}` | null;
  step: RotationStep;
  movedPasskeys: MovedPasskey[];
  moveProgress: MoveProgress | null;
  moveOutcome: MoveOutcome | null;
  /**
   * Secrets. Never select them into a component: read them with `getState()`
   * at the moment of signing.
   */
  newKey: `0x${string}` | null;
  oldSigner: OldCardSigner | null;
  /** Starts a replacement of `oldAddress`'s card, generating the new key now. */
  begin: (oldAddress: `0x${string}`, oldSigner: OldCardSigner) => void;
  /** Continues moving what is left on an old card to the signed-in wallet. */
  resume: (oldAddress: `0x${string}`, newAddress: `0x${string}`, oldSigner: OldCardSigner) => void;
  setStep: (step: RotationStep) => void;
  setMovedPasskeys: (passkeys: MovedPasskey[]) => void;
  setMoveProgress: (progress: MoveProgress | null) => void;
  setMoveOutcome: (outcome: MoveOutcome | null) => void;
  clear: () => void;
};

const EMPTY = {
  oldAddress: null,
  newAddress: null,
  step: "review" as RotationStep,
  movedPasskeys: [],
  moveProgress: null,
  moveOutcome: null,
  newKey: null,
  oldSigner: null,
};

/**
 * Custody of one sign-in card replacement (GH #412).
 *
 * The flow outlives the component that drives it: `AuthenticatedRoute`
 * unmounts its children while the session moves from the old card to the new
 * one, and the old wallet's key must still sign afterwards. So both keys live
 * here, memory-only: no `persist`, no `devtools`, never React state or a query
 * cache. A reload drops them, which is safe — the new card was saved and
 * scanned back before anything moved, and "Move what's left" scans the old
 * card again. Cleared on sign-out (`clearIdentitySecrets("none")`), on leaving
 * the route and when the flow finishes. Dropping the reference bounds
 * retention; it does not zero JavaScript memory.
 */
export const useRotationSession = create<RotationSessionState>()((set) => ({
  ...EMPTY,
  begin: (oldAddress, oldSigner) => {
    const newKey = generatePrivateKey();
    set({
      ...EMPTY,
      oldAddress,
      oldSigner,
      newKey,
      newAddress: privateKeyToAccount(newKey).address,
      step: "review",
    });
  },
  resume: (oldAddress, newAddress, oldSigner) =>
    set({ ...EMPTY, oldAddress, newAddress, oldSigner, step: "moving" }),
  setStep: (step) => set({ step }),
  setMovedPasskeys: (movedPasskeys) => set({ movedPasskeys }),
  setMoveProgress: (moveProgress) => set({ moveProgress }),
  setMoveOutcome: (moveOutcome) => set({ moveOutcome }),
  clear: () => set(EMPTY),
}));
