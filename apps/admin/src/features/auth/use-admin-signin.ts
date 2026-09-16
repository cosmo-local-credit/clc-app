/**
 * The two ways an operator signs in, both reusing what apps/web already does.
 *
 * Paper wallet / private key: SIWE over the key, via @clc/api. Passkey: a WebAuthn
 * assertion the backend verifies against the stored credential. Either way
 * clc-core issues the same session cookie and the console re-reads
 * /auth/session — the role gate lives there, not here, so signing in with a
 * non-superadmin account lands on the `unauthorized` screen rather than failing
 * at the sign-in step.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { privateKeySigner, signInWithSiwe, type SiweRequest } from "@clc/api/features/auth/siwe";
import { clcApi } from "#/lib/api";
import { CHAIN_ID } from "#/lib/chain";
import { adminSessionQueryKey, clearProtectedQueries } from "./admin-session";
import { useOperatorKeyStore } from "./operator-key";
import { collectAdminAssertion } from "./webauthn-assertion";

function siweRequest(): SiweRequest {
  return {
    domain: window.location.host,
    uri: window.location.origin,
    chainId: CHAIN_ID,
    // Distinct from the app's statement so a signature prompt makes it obvious
    // which surface asked for it.
    statement: "Sign in to the CLC admin console",
  };
}

/**
 * Adopts the new session after a sign-in.
 *
 * Anything cached under the previous identity is dropped first: an operator can
 * sign in over another's expired session without the page reloading, and the
 * console must not show them rows fetched for someone else.
 *
 * `refetchType: "all"` because the session query is cached as `null` from the
 * unauthenticated render and would otherwise stay inactive behind the sign-in
 * panel, leaving the console showing sign-in after a successful sign-in.
 */
function useSessionRefresh() {
  const queryClient = useQueryClient();
  return () => {
    clearProtectedQueries(queryClient);
    return queryClient.invalidateQueries({ queryKey: adminSessionQueryKey, refetchType: "all" });
  };
}

/**
 * Sign-in is also where the console learns the key it can sign with.
 *
 * Both credentials arrive here and nowhere else, so adopting them is one line in
 * each mutation rather than a concern the sign-in form has to remember. Adoption
 * happens only after clc-core accepted the credential: a key that failed SIWE is
 * not the operator's, and holding it would let a later signature be attempted
 * with it.
 *
 * Paper-wallet keys persist across reloads after a successful sign-in; passkey
 * signing records remain in memory. See operator-key.ts for the boundary.
 */
export function useAdminPrivateKeySignin() {
  const refreshSession = useSessionRefresh();
  const adoptPrivateKey = useOperatorKeyStore((state) => state.adoptPrivateKey);

  return useMutation({
    mutationFn: (privateKey: `0x${string}`) =>
      signInWithSiwe(clcApi.auth, privateKeySigner(privateKey), siweRequest()),
    onSuccess: (_result, privateKey) => {
      adoptPrivateKey(privateKey);
      return refreshSession();
    },
  });
}

export function useAdminPasskeySignin() {
  const refreshSession = useSessionRefresh();
  const adoptPasskey = useOperatorKeyStore((state) => state.adoptPasskey);

  return useMutation({
    mutationFn: async () => {
      const assertion = await collectAdminAssertion();
      // The verify response carries the address, key hash and public key, so the
      // only thing it does not already say is which credential answered — and
      // this assertion is where that came from. Together they are a complete
      // signing credential for no second prompt and no extra call.
      return { result: await clcApi.auth.signinWithWebAuthn(assertion), assertion };
    },
    onSuccess: ({ result, assertion }) => {
      adoptPasskey({
        credentialId: assertion.credentialId,
        keyHash: result.keyHash as `0x${string}`,
        publicKeyX: result.publicKeyX,
        publicKeyY: result.publicKeyY,
        address: result.address as `0x${string}`,
        stale: false,
      });
      return refreshSession();
    },
  });
}
