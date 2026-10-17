import { NearbyCatalog } from "#/components/nearby-catalog";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useConnection, useDisconnect } from "wagmi";

import { clearIdentitySecrets, clearScopedQueries } from "#/features/auth/api/identity-reset";
import { useBackendLogout } from "#/features/auth/hooks/use-auth-session";
import { authSessionQueryKey } from "#/features/auth/hooks/use-auth-status";
import { clearPersistedLocation } from "#/features/home/api/last-location-storage";
import { clearMarketCamera } from "#/features/home/api/market-camera-storage";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import { abortWalletSwitch } from "#/lib/wallet-session";
import { useCaliburDelegation } from "#/features/webauthn/hooks/use-calibur-delegation";
import { ActivityPage } from "./activity-page";
import { MarketPage } from "./market-page";
import { PostsPage } from "./posts-page";
import { SettingsPage } from "./settings-page";
import { isPrivateHomeTab, type HomeTab } from "#/lib/navigation/home-tabs";
import { WalletPage } from "./wallet-page";

export type HomePageProps = {
  activeTab?: HomeTab;
  isAuthenticated?: boolean;
  creditableSearch?: boolean | string | readonly (boolean | string)[];
};

export function HomePage({
  activeTab = "market",
  isAuthenticated = true,
  creditableSearch,
}: HomePageProps) {
  const { address } = useConnection();
  const delegationStatus = useCaliburDelegation(address);
  const { mutateAsync: disconnect } = useDisconnect();
  const queryClient = useQueryClient();
  const backendLogout = useBackendLogout();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const currentTab = !isAuthenticated && isPrivateHomeTab(activeTab) ? "market" : activeTab;
  // A connected wallet without a backend session is still a guest
  // (docs/AUTH.md), so an expired session must not keep that wallet's scope.
  const locationOwner = isAuthenticated && address ? address.toLowerCase() : GUEST_STORAGE_OWNER;

  async function handleSignOut() {
    // Everything that must happen regardless of what fails runs first, before
    // the first `await`. The three awaits below are each wrapped in a catch that
    // swallows the failure, so anything sequenced after them is not guaranteed to
    // run at all — and a throwing `disconnect()` used to leave a raw private key
    // on disk while the UI dropped to guest.

    // Cancel any in-flight wallet switch first so a pending ?w= import can't
    // land after disconnect and silently take over the session. Before the
    // credential clear, too: a switch sitting inside its own `await` would
    // otherwise store the imported key afterwards and strand it.
    abortWalletSwitch();
    // Both credentials, not just this connector's. Each connector's `disconnect`
    // only ever cleaned up after itself, so a paper-wallet sign-out left a
    // passkey registered during the session behind for the next person to use.
    clearIdentitySecrets("none");
    // Drop the precise location too, and the last view of the map, which can
    // show the same thing. Neither may survive on a shared device.
    clearPersistedLocation();
    clearMarketCamera();
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

  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      {currentTab === "market" ? (
        <NearbyCatalog>
          <MarketPage
            isAuthenticated={isAuthenticated}
            locationOwner={locationOwner}
            creditableSearch={creditableSearch}
          />
        </NearbyCatalog>
      ) : (
        <div className="min-h-[100svh] pb-bottom-nav">
          <main className="px-6 pt-[calc(env(safe-area-inset-top)+1rem)]">
            {currentTab === "wallet" ? <WalletPage address={address} /> : null}
            {currentTab === "activity" ? <ActivityPage address={address} /> : null}
            {currentTab === "posts" ? (
              <NearbyCatalog>
                <PostsPage />
              </NearbyCatalog>
            ) : null}
            {currentTab === "settings" ? (
              <SettingsPage
                address={address}
                delegationStatus={delegationStatus}
                isSigningOut={isSigningOut}
                onSignOut={() => {
                  void handleSignOut();
                }}
              />
            ) : null}
          </main>
        </div>
      )}
    </div>
  );
}
