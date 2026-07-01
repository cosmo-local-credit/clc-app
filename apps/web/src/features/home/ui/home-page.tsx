import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, useDisconnect } from "wagmi";

import { useBackendLogout } from "#/features/auth/hooks/use-auth-session";
import { authSessionQueryKey } from "#/features/auth/hooks/use-auth-status";
import { abortWalletSwitch } from "#/lib/wallet-session";
import { useCaliburDelegation } from "#/features/webauthn/hooks/use-calibur-delegation";
import { ActivityPage } from "./activity-page";
import { BottomNavigation } from "./bottom-navigation";
import { MarketPage } from "./market-page";
import { OnboardingBanner } from "./onboarding-banner";
import { SettingsPage } from "./settings-page";
import { isPrivateHomeTab, type HomeTab } from "./tabs";
import { UndonePage } from "./undone-page";
import { WalletPage } from "./wallet-page";

type HomePageProps = {
  activeTab?: HomeTab;
  onTabChange?: (tab: HomeTab) => void;
  isAuthenticated?: boolean;
};

export function HomePage({ activeTab, onTabChange, isAuthenticated = true }: HomePageProps) {
  const { address } = useAccount();
  const delegationStatus = useCaliburDelegation(address);
  const { disconnectAsync } = useDisconnect();
  const queryClient = useQueryClient();
  const backendLogout = useBackendLogout();
  const [fallbackTab, setFallbackTab] = useState<HomeTab>("market");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const requestedTab = activeTab ?? fallbackTab;
  const currentTab = !isAuthenticated && isPrivateHomeTab(requestedTab) ? "market" : requestedTab;

  function handleTabChange(tab: HomeTab) {
    if (!activeTab) setFallbackTab(tab);
    onTabChange?.(tab);
  }

  async function handleSignOut() {
    // Cancel any in-flight wallet switch first so a pending ?w= import can't
    // land after disconnect and silently take over the session.
    abortWalletSwitch();
    setIsSigningOut(true);
    try {
      await backendLogout.mutateAsync();
    } catch {
      // Local disconnect must still happen if the session cookie is already gone.
    }
    try {
      await disconnectAsync();
      await queryClient.invalidateQueries({ queryKey: authSessionQueryKey });
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      {currentTab === "market" ? (
        <MarketPage onboardingBanner={!isAuthenticated ? <OnboardingBanner /> : undefined} />
      ) : (
        <div className="min-h-[100svh] pb-[calc(4.75rem+env(safe-area-inset-bottom))]">
          <main className="px-6 pt-[calc(env(safe-area-inset-top)+1rem)]">
            {currentTab === "wallet" ? <WalletPage address={address} /> : null}
            {currentTab === "activity" ? <ActivityPage address={address} /> : null}
            {currentTab === "pool" ? <UndonePage tab="pool" /> : null}
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
      <BottomNavigation
        activeTab={currentTab}
        onTabChange={handleTabChange}
        isAuthenticated={isAuthenticated}
      />
    </div>
  );
}
