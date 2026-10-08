import type { QueryClient } from "@tanstack/react-query";

import { clearPrivateKey } from "#/connectors/privateKey";
import { usePoolCreateDraft } from "#/features/pools/state/pool-create-draft";
import { useCollectPayerKey } from "#/features/wallet/state/collect-payer-key";
import { useCollectSession } from "#/features/wallet/state/collect-session";
import { useVoucherCreateDraft } from "#/features/vouchers/state/voucher-create-draft";
import { clearWebAuthnCredential } from "#/lib/webauthn-storage";

/**
 * Which credential slot the caller is about to own, and must therefore keep.
 *
 * `"none"` is for a teardown — sign-out, or the moment before a fresh key is
 * written. The other two are for a sign-in that has just minted one kind of
 * credential and needs the other kind gone.
 */
export type RetainedSecretSlot = "none" | "private-key" | "webauthn";

/**
 * Hard-deletes stored credentials, keeping only the slot the caller just wrote.
 *
 * The leak this closes: a paper-wallet sign-out runs the private-key connector's
 * `disconnect()`, which clears `clc_pk_*` and nothing else. If that user had
 * registered a passkey during the session, `clc_webauthn` survived, and the next
 * person to pick up the phone was offered a passkey sign-in that authenticates
 * as the previous one. Each connector only ever cleaned up after itself, so no
 * single sign-out cleared both.
 *
 * Synchronous on purpose, so sign-out can call it **before its first `await`**.
 * `backendLogout()` and `disconnect()` are both wrapped in try/catch there, so
 * anything sequenced after them is not guaranteed to run at all — and a throwing
 * `disconnect()` currently leaves a raw private key on disk while the UI shows
 * guest.
 *
 * Never throws, for the same reason. A blocked store is the only realistic
 * failure, and in that case there is no persisted secret to clear anyway; an
 * exception here would abort the sign-out that called it and leave the user
 * signed in, which is strictly worse than a no-op.
 */
export function clearIdentitySecrets(retain: RetainedSecretSlot): void {
  if (retain !== "private-key") {
    try {
      clearPrivateKey();
    } catch {
      // See above: nothing to clear if the store is unreachable.
    }
  }
  if (retain !== "webauthn") {
    try {
      clearWebAuthnCredential();
    } catch {
      // As above.
    }
  }
  // A card-collection payer's key is never stored, but a sign-out must not
  // leave it in memory for whoever picks the phone up next.
  useCollectPayerKey.getState().clear();
  useCollectSession.getState().reset();
}

/**
 * Drops every cached read made on the previous identity's behalf.
 *
 * `removeQueries`, not `invalidateQueries`: the default `staleTime` is a minute
 * (`apps/web/src/router.tsx`), so an invalidated cache still hands the previous
 * user's rows to whoever comes next while the refetch is in flight.
 *
 * Two prefixes, because the app has two. `@clc/api` hangs every backend query
 * off `["clc", …]`, so that one prefix covers the whole server surface and needs
 * no update when a feature is added — this is the contract
 * `packages/api/src/features/auth/queries.ts` documents and
 * `apps/admin/src/features/auth/admin-session.ts` already relies on. The address
 * book is the exception: it is backed by `localStorage` rather than the backend,
 * so it lives under `["address-book", …]` and would escape a `["clc"]` sweep.
 *
 * `authSessionQueryKey` is deliberately outside both, so this can clear the data
 * and still let the new session be read.
 */
export function clearScopedQueries(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: ["clc"] });
  queryClient.removeQueries({ queryKey: ["address-book"] });
}

/**
 * Drops the half-written pool and voucher a previous account left in memory.
 *
 * These two stores never touched disk, so they looked safe — but signing out
 * does not reload the page, so the store outlives the session that filled it and
 * the next person to open the create flow finds it prefilled with someone
 * else's pool. Narrow, since it needs a sign-in without a reload, but it is the
 * same class of bug as the persisted ones.
 *
 * Reached through `getState()` rather than a hook because the caller is not
 * always a component, the same way
 * `apps/admin/src/features/auth/admin-session.ts` clears its operator key.
 */
export function clearInMemoryDrafts(): void {
  usePoolCreateDraft.getState().clearDraft();
  useVoucherCreateDraft.getState().clearDraft();
  useCollectPayerKey.getState().clear();
  useCollectSession.getState().reset();
}
