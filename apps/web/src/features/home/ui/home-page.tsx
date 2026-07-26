import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useConnection, useDisconnect } from "wagmi";

import { useBackendLogout } from "#/features/auth/hooks/use-auth-session";
import { authSessionQueryKey } from "#/features/auth/hooks/use-auth-status";
import {
  GUEST_LOCATION_OWNER,
  clearPersistedLocation,
} from "#/features/home/api/last-location-storage";
import { abortWalletSwitch } from "#/lib/wallet-session";
import { useCaliburDelegation } from "#/features/webauthn/hooks/use-calibur-delegation";
import { ActivityPage } from "./activity-page";
import { BottomNavigation } from "./bottom-navigation";
import { MarketPage } from "./market-page";
import { OnboardingBanner } from "./onboarding-banner";
import { PostsPage } from "./posts-page";
import { SettingsPage } from "./settings-page";
import { isPrivateHomeTab, type HomeTab } from "./tabs";
import { WalletPage } from "./wallet-page";

export type HomePageProps = {
  activeTab?: HomeTab;
  isAuthenticated?: boolean;
};

export function HomePage({ activeTab = "market", isAuthenticated = true }: HomePageProps) {
  const { address } = useConnection();
  const delegationStatus = useCaliburDelegation(address);
  const { mutateAsync: disconnect } = useDisconnect();
  const queryClient = useQueryClient();
  const backendLogout = useBackendLogout();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const currentTab = !isAuthenticated && isPrivateHomeTab(activeTab) ? "market" : activeTab;
  // A connected wallet without a backend session is still a guest
  // (docs/AUTH.md), so an expired session must not keep that wallet's scope.
  const locationOwner = isAuthenticated && address ? address.toLowerCase() : GUEST_LOCATION_OWNER;

  async function handleSignOut() {
    // Cancel any in-flight wallet switch first so a pending ?w= import can't
    // land after disconnect and silently take over the session.
    abortWalletSwitch();
    // Drop the precise location before any awaits so every failure path below
    // still leaves it cleared. It must not survive on a shared device.
    clearPersistedLocation();
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
        <MarketPage
          onboardingBanner={!isAuthenticated ? <OnboardingBanner /> : undefined}
          locationOwner={locationOwner}
        />
      ) : (
        <div className="min-h-[100svh] pb-[calc(4.75rem+env(safe-area-inset-bottom))]">
          <main className="px-6 pt-[calc(env(safe-area-inset-top)+1rem)]">
            {currentTab === "wallet" ? <WalletPage address={address} /> : null}
            {currentTab === "activity" ? <ActivityPage address={address} /> : null}
            {currentTab === "posts" ? <PostsPage /> : null}
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
      <BottomNavigation activeTab={currentTab} isAuthenticated={isAuthenticated} />
    </div>
  );
}
