import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy, Suspense, useEffect } from "react";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import {
  canonicalRedirectSearch,
  type CatalogRouteSearch,
  pickCatalogSearch,
} from "#/lib/navigation/catalog-search";
import {
  type HomeRouteSearch,
  isPrivateHomeTab,
  parseHomeSearch,
} from "#/lib/navigation/home-tabs";

const HomePage = lazy(() =>
  import("#/features/home/ui/home-page").then((module) => ({
    default: module.HomePage,
  })),
);

export const Route = createFileRoute("/_nav/")({
  staticData: { navOwner: "home" },
  validateSearch: (search): HomeRouteSearch & CatalogRouteSearch => ({
    ...parseHomeSearch(search),
    ...pickCatalogSearch(search),
  }),
  beforeLoad: ({ search }) => {
    const next = canonicalRedirectSearch(search, { voucherRelationships: search.tab === "posts" });
    if (!next) return;
    throw redirect({ to: "/", search: next, replace: true });
  },
  component: IndexPage,
});

function IndexPage() {
  const auth = useAuthStatus();
  const { tab, view } = Route.useSearch();
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
      <HomePage activeTab={activeTab} marketView={view} isAuthenticated={auth.isAuthenticated} />
    </Suspense>
  );
}

function HomePageFallback() {
  return <div className="min-h-[100svh] bg-background" />;
}
