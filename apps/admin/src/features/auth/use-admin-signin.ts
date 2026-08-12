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
import { adminSessionQueryKey } from "./admin-session";
import { collectAdminAssertion } from "./webauthn-assertion";

const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? "42220");

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
 * Refetches the session after a sign-in.
 *
 * `refetchType: "all"` because the session query is cached as `null` from the
 * unauthenticated render and would otherwise stay inactive behind the sign-in
 * panel, leaving the console showing sign-in after a successful sign-in.
 */
function useSessionRefresh() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: adminSessionQueryKey, refetchType: "all" });
}

export function useAdminPrivateKeySignin() {
  const refreshSession = useSessionRefresh();

  return useMutation({
    mutationFn: (privateKey: `0x${string}`) =>
      signInWithSiwe(clcApi.auth, privateKeySigner(privateKey), siweRequest()),
    onSuccess: refreshSession,
  });
}

export function useAdminPasskeySignin() {
  const refreshSession = useSessionRefresh();

  return useMutation({
    mutationFn: async () => clcApi.auth.signinWithWebAuthn(await collectAdminAssertion()),
    onSuccess: refreshSession,
  });
}
