import { useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect } from "react";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { homeTabPaths, type HomeTab, isPrivateHomeTab } from "#/features/home/ui/tabs";

const HomePage = lazy(() =>
  import("./home-page").then((module) => ({
    default: module.HomePage,
  })),
);

export function HomeRoutePage({ activeTab }: { activeTab: HomeTab }) {
  const auth = useAuthStatus();
  const navigate = useNavigate();
  const currentTab = !auth.isAuthenticated && isPrivateHomeTab(activeTab) ? "market" : activeTab;

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated && isPrivateHomeTab(activeTab)) {
      void navigate({ to: homeTabPaths.market, replace: true });
    }
  }, [activeTab, auth.isAuthenticated, auth.isLoading, navigate]);

  if (auth.isLoading) return <HomePageFallback />;

  return (
    <Suspense fallback={<HomePageFallback />}>
      <HomePage
        activeTab={currentTab}
        isAuthenticated={auth.isAuthenticated}
        onTabChange={(nextTab) => {
          if (nextTab === currentTab) return;
          void navigate({ to: homeTabPaths[nextTab] });
        }}
      />
    </Suspense>
  );
}

function HomePageFallback() {
  return <div className="min-h-[100svh] bg-background" />;
}
