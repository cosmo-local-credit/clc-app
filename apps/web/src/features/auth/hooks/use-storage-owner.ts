import { type AuthStatus, useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { GUEST_STORAGE_OWNER, type StorageOwner } from "#/lib/storage/owner-tier-key";

/**
 * Which storage tier the person at the phone owns, or `null` while that is
 * genuinely unknown.
 *
 * Derived from the **backend session**, not the connected wallet. A connected
 * wallet whose session is missing or belongs to another address is
 * `connectedNoSession` — a guest (docs/AUTH.md) — so keying on the wallet alone
 * would let a lapsed session keep reading the previous owner's tier. This is the
 * same derivation `features/home/ui/home-page.tsx` already makes for
 * `locationOwner`.
 *
 * It is a derivation, not an event: no effect, nothing stored. That is what
 * makes wagmi's auto-reconnect harmless even though it changes the identity with
 * no flow code running — a reconnected wallet simply starts reading its own
 * tier. Identity *transitions* are the separate concern, in
 * {@link ./use-identity-transition}.
 *
 * **Why `null` rather than falling back to `"guest"`.** The two states where the
 * owner is undecided — the session check still in flight, or failed outright —
 * are not evidence that nobody is signed in. Reading the guest tier there is
 * harmless and self-correcting, but *writing* a signed-in user's data into it
 * splits their data across two tiers, and the split outlives the error that
 * caused it. `null` also means undecided is never a transition endpoint, so a
 * flaky session check produces `A → null → A` and fires no teardown at all,
 * while a real `A → guest` or `guest → A` still does. That falls out for free,
 * and it debounces a wallet switch too: the session query re-keys mid-switch, so
 * the owner is briefly `null` and the transition fires once, after it settles.
 */
export function resolveStorageOwner(
  state: AuthStatus["state"],
  address: `0x${string}` | undefined,
): StorageOwner | null {
  switch (state) {
    case "authenticated":
      return address ? address.toLowerCase() : null;
    case "guest":
    case "connectedNoSession":
      return GUEST_STORAGE_OWNER;
    case "loading":
    case "sessionCheckError":
      return null;
  }
}

export function useStorageOwner(): StorageOwner | null {
  const { state, address } = useAuthStatus();
  return resolveStorageOwner(state, address);
}
