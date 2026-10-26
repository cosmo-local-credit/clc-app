import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useDisconnect } from "wagmi";

import { clearMarketDiscoveryArea } from "#/components/nearby-catalog";
import { clearIdentitySecrets, clearScopedQueries } from "#/features/auth/api/identity-reset";
import { useBackendLogout } from "#/features/auth/hooks/use-auth-session";
import { authSessionQueryKey } from "#/features/auth/hooks/use-auth-status";
import { clearPersistedLocation } from "#/features/home/api/last-location-storage";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import { abortWalletSwitch } from "#/lib/wallet-session";

/**
 * The same sequence the phone settings row runs. Everything that must happen
 * even when a later await throws runs before the first await.
 */
export function useSignOut(locationOwner: string) {
  const { mutateAsync: disconnect } = useDisconnect();
  const queryClient = useQueryClient();
  const backendLogout = useBackendLogout();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function signOut() {
    abortWalletSwitch();
    clearIdentitySecrets("none");
    clearPersistedLocation();
    if (locationOwner !== GUEST_STORAGE_OWNER) clearMarketDiscoveryArea(locationOwner);
    clearScopedQueries(queryClient);
    setIsSigningOut(true);
    try {
      await backendLogout.mutateAsync();
    } catch {
      // Local disconnect must still happen if the session cookie is already gone.
    }
    try {
      await disconnect();
    } catch {
      // A dead connector must not strand the user in a signed-in-looking UI.
    }
    try {
      await queryClient.invalidateQueries({ queryKey: authSessionQueryKey });
    } finally {
      setIsSigningOut(false);
    }
  }

  return { signOut, isSigningOut };
}
