import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { type HomeTab, parseHomeTab } from "#/features/home/ui/tabs";
import { LandingPage } from "#/features/onboarding/ui/landing-page";

const HomePage = lazy(() =>
  import("#/components/home-page").then((module) => ({
    default: module.HomePage,
  })),
);

export const Route = createFileRoute("/")({
  validateSearch: (search): { tab?: HomeTab } => ({
    tab: parseHomeTab(search.tab),
  }),
  component: IndexPage,
});

function IndexPage() {
  const { isConnected } = useAccount();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (mounted && isConnected) {
    return (
      <Suspense fallback={<HomePageFallback />}>
        <HomePage
          activeTab={tab}
          onTabChange={(nextTab) => {
            void navigate({ to: "/", search: { tab: nextTab }, replace: true });
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
