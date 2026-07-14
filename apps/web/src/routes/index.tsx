import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect } from "react";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { isPrivateHomeTab, type HomeTab, parseHomeTab } from "#/features/home/ui/tabs";

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
  const auth = useAuthStatus();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const activeTab = auth.isAuthenticated ? tab : isPrivateHomeTab(tab ?? "market") ? "market" : tab;

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated && isPrivateHomeTab(tab ?? "market")) {
      void navigate({ to: "/", search: { tab: "market" }, replace: true });
    }
  }, [auth.isAuthenticated, auth.isLoading, navigate, tab]);

  if (auth.isLoading) return <HomePageFallback />;

  return (
    <Suspense fallback={<HomePageFallback />}>
      <HomePage activeTab={activeTab} isAuthenticated={auth.isAuthenticated} />
    </Suspense>
  );
}

function HomePageFallback() {
  return <div className="min-h-[100svh] bg-background" />;
}
