import { NearbyCatalog } from "#/components/nearby-catalog";
import { useConnection } from "wagmi";

import { useSignOut } from "#/features/home/hooks/use-sign-out";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import { useCaliburDelegation } from "#/features/webauthn/hooks/use-calibur-delegation";
import { ActivityPage } from "./activity-page";
import { MarketPage } from "./market-page";
import { PostsPage } from "./posts-page";
import { SettingsPage } from "./settings-page";
import { isPrivateHomeTab, type HomeTab } from "#/lib/navigation/home-tabs";
import { WalletPage } from "./wallet-page";
import type { ActivityKind } from "@clc/api/features/accounts/client";

export type HomePageProps = {
  activeTab?: HomeTab;
  isAuthenticated?: boolean;
  creditableSearch?: boolean | string | readonly (boolean | string)[];
  activityQ?: string;
  activityTypes?: readonly ActivityKind[];
  onActivityQueryChange?: (query: string) => void;
  onActivityTypesChange?: (types: readonly ActivityKind[]) => void;
};

export function HomePage({
  activeTab = "market",
  isAuthenticated = true,
  creditableSearch,
  activityQ,
  activityTypes,
  onActivityQueryChange,
  onActivityTypesChange,
}: HomePageProps) {
  const { address } = useConnection();
  const delegationStatus = useCaliburDelegation(address);
  const currentTab = !isAuthenticated && isPrivateHomeTab(activeTab) ? "market" : activeTab;
  const isFeedTab = currentTab === "activity" || currentTab === "posts";
  // A connected wallet without a backend session is still a guest
  // (docs/AUTH.md), so an expired session must not keep that wallet's scope.
  const locationOwner = isAuthenticated && address ? address.toLowerCase() : GUEST_STORAGE_OWNER;
  const { signOut, isSigningOut } = useSignOut(locationOwner);

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
          <main className={isFeedTab ? "px-4" : "px-6 pt-[calc(env(safe-area-inset-top)+1rem)]"}>
            {currentTab === "wallet" ? <WalletPage address={address} /> : null}
            {currentTab === "activity" ? (
              <ActivityPage
                address={address}
                query={activityQ}
                types={activityTypes}
                onQueryChange={onActivityQueryChange}
                onTypesChange={onActivityTypesChange}
              />
            ) : null}
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
                  void signOut();
                }}
              />
            ) : null}
          </main>
        </div>
      )}
    </div>
  );
}
