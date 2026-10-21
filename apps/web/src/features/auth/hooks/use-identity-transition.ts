import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { clearInMemoryDrafts, clearScopedQueries } from "#/features/auth/api/identity-reset";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { resetNotificationIdentity } from "#/features/notifications/recovery/identity-reset";
import { GUEST_STORAGE_OWNER, type StorageOwner } from "#/lib/storage/owner-tier-key";
import { dropLegacyUnscopedKeys, touchOwnerTier } from "#/lib/storage/owner-tier-registry";

export type IdentityTransition = { from: StorageOwner; to: StorageOwner };

/**
 * The last tier that actually resolved, for the app's lifetime.
 *
 * A module singleton rather than a ref in the component, for the same reason
 * `lib/wallet-session.ts` and `providers/auth-bootstrap.ts` are: whether the
 * identity has changed is an app-lifetime fact, and a StrictMode remount must
 * not re-fire the teardown. It is also the only shape under which the question
 * is answerable in one place across five different sign-in flows.
 */
let lastResolvedOwner: StorageOwner | null = null;

/** @returns the transition, or null when nothing changed. */
export function noteResolvedIdentity(owner: StorageOwner): IdentityTransition | null {
  const previous = lastResolvedOwner;
  lastResolvedOwner = owner;
  // First resolution of the app's life is not a transition — there is no
  // previous owner whose residue needs clearing.
  if (previous === null || previous === owner) return null;
  return { from: previous, to: owner };
}

export function resetIdentityTransitionForTests(): void {
  lastResolvedOwner = null;
}

/**
 * Runs the once-per-identity-change teardown that no sign-in or sign-out flow
 * can run for itself.
 *
 * There is no choke point for identity in this app: five paths change it — the
 * sign-in panel's two branches, the `?w=` switch, onboarding, sign-out — and a
 * sixth, wagmi's auto-reconnect in `providers/web3.tsx`, changes it with no flow
 * code on the stack at all. Anything that must happen on *every* change
 * therefore cannot live in the flows.
 *
 * **This hook must never touch a stored credential.** It observes an identity
 * that has already been established: by the time the owner reads as B, B's
 * `clc_pk_raw` is on disk and the connector reads it for every signature. A
 * reactive "the address changed, so wipe the secrets" would delete the key of
 * the wallet that just connected, and on the `?w=` path it would also destroy
 * the copies `handleConfirmSwitch`'s rollback restores. Clearing secrets is the
 * flows' job, on the outgoing edge, where the code knows which slot it is about
 * to own — see `clearIdentitySecrets`.
 *
 * What is safe here is everything that only needs the change to have happened:
 * the query cache, the notification stores, and the tier bookkeeping.
 */
export function useIdentityTransitionTeardown(): void {
  const owner = useStorageOwner();
  const queryClient = useQueryClient();

  useEffect(() => {
    // Undetermined is not guest. Returning here is what keeps a flaky session
    // check (`A → null → A`) and a mid-flight wallet switch from firing a
    // teardown, while a real sign-out (`A → guest`) still does.
    if (owner === null) return;

    dropLegacyUnscopedKeys();
    touchOwnerTier(owner);

    const transition = noteResolvedIdentity(owner);
    if (!transition) {
      if (owner === GUEST_STORAGE_OWNER)
        void resetNotificationIdentity({ onlyIfSessionEnded: true });
      return;
    }

    clearScopedQueries(queryClient);
    clearInMemoryDrafts();
    // Clear the outgoing registration without blocking the established session.
    if (transition.from === GUEST_STORAGE_OWNER) return;
    void resetNotificationIdentity({
      previousWalletAddress: transition.from,
    });
  }, [owner, queryClient]);
}
