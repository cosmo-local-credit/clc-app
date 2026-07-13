import { useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { homeTabPaths, type HomeTab } from "#/features/home/ui/tabs";
import { LandingPage } from "#/features/onboarding/ui/landing-page";

const HomePage = lazy(() =>
  import("./home-page").then((module) => ({
    default: module.HomePage,
  })),
);

export function HomeRoutePage({ activeTab }: { activeTab: HomeTab }) {
  const { isConnected } = useAccount();
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (mounted && isConnected) {
    return (
      <Suspense fallback={<HomePageFallback />}>
        <HomePage
          activeTab={activeTab}
          onTabChange={(nextTab) => {
            if (nextTab === activeTab) return;
            void navigate({ to: homeTabPaths[nextTab] });
          }}
        />
      </Suspense>
    );
  }

  return <LandingPage />;
}

function HomePageFallback() {
  return <div className="min-h-[100svh] bg-background" />;
}
