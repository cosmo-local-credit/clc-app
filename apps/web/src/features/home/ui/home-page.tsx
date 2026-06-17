import { useState } from "react";
import { useAccount, useDisconnect } from "wagmi";

import { useBackendLogout } from "#/features/auth/hooks/use-auth-session";
import { clearAuthToken } from "#/features/auth/state/token";
import { useCaliburDelegation } from "#/features/webauthn/hooks/use-calibur-delegation";
import { BottomNavigation } from "./bottom-navigation";
import { MarketPage } from "./market-page";
import { SettingsPage } from "./settings-page";
import type { HomeTab } from "./tabs";
import { UndonePage } from "./undone-page";
import { WalletPage } from "./wallet-page";

type HomePageProps = {
  activeTab?: HomeTab;
  onTabChange?: (tab: HomeTab) => void;
};

export function HomePage({ activeTab, onTabChange }: HomePageProps) {
  const { address } = useAccount();
  const delegationStatus = useCaliburDelegation(address);
  const { disconnectAsync } = useDisconnect();
  const backendLogout = useBackendLogout();
  const [fallbackTab, setFallbackTab] = useState<HomeTab>("wallet");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const currentTab = activeTab ?? fallbackTab;

  function handleTabChange(tab: HomeTab) {
    if (!activeTab) setFallbackTab(tab);
    onTabChange?.(tab);
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    clearAuthToken();
    try {
      await backendLogout.mutateAsync();
    } catch {
      // Local disconnect must still happen if the session cookie is already gone.
    }
    try {
      await disconnectAsync();
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      {currentTab === "market" ? (
        <MarketPage />
      ) : (
        <div className="min-h-[100svh] pb-[calc(4.75rem+env(safe-area-inset-bottom))]">
          <main className="px-6 pt-[calc(env(safe-area-inset-top)+1rem)]">
            {currentTab === "wallet" ? <WalletPage /> : null}
            {currentTab === "activity" ? <UndonePage tab="activity" /> : null}
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
      <BottomNavigation activeTab={currentTab} onTabChange={handleTabChange} />
    </div>
  );
}
