import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { canonicalRedirectSearch } from "#/lib/navigation/catalog-search";
import {
  marketplaceSearchForScope,
  pickMarketplaceSearch,
  type MarketplaceRouteSearch,
} from "#/lib/navigation/marketplace-search";
import {
  type HomeRouteSearch,
  isPrivateHomeTab,
  parseHomeSearch,
} from "#/lib/navigation/home-tabs";
import { parseVoucherAddress } from "#/lib/navigation/voucher-sheet-search";

const HomePage = lazy(() =>
  import("#/features/home/ui/home-page").then((module) => ({
    default: module.HomePage,
  })),
);

export const Route = createFileRoute("/_nav/")({
  staticData: { navOwner: "home" },
  validateSearch: (search): HomeRouteSearch & MarketplaceRouteSearch => ({
    ...parseHomeSearch(search),
    ...pickMarketplaceSearch(search),
  }),
  beforeLoad: ({ search }) => {
    const voucherAddress = parseVoucherAddress(search.voucher);
    const isMapVoucher = search.tab === "market" && search.view === "map";
    if (voucherAddress && !isMapVoucher) {
      const from =
        search.tab === "wallet"
          ? "wallet"
          : search.tab === "posts"
            ? "posts"
            : search.tab === "market"
              ? "market"
              : undefined;
      if (from) {
        throw redirect({
          to: "/vouchers/$voucherAddress",
          params: { voucherAddress },
          search: { from },
          replace: true,
        });
      }
      throw redirect({
        to: "/",
        search: { ...search, voucher: undefined },
        replace: true,
      });
    }
    if (search.tab === "market" && search.view === "list") {
      throw redirect({
        to: "/market",
        search: marketplaceSearchForScope(pickMarketplaceSearch(search), null),
        replace: true,
      });
    }
    const next = canonicalRedirectSearch(search, { voucherRelationships: search.tab === "posts" });
    if (!next) return;
    throw redirect({ to: "/", search: next, replace: true });
  },
  component: IndexPage,
});

function IndexPage() {
  const auth = useAuthStatus();
  const { tab = "market", view, creditable } = Route.useSearch();

  if (auth.isLoading) return <HomePageFallback />;

  const page = (
    <Suspense fallback={<HomePageFallback />}>
      <HomePage
        activeTab={tab}
        marketView={view}
        isAuthenticated={auth.isAuthenticated}
        creditableSearch={creditable}
      />
    </Suspense>
  );
  // A guest's Wallet, Activity or Settings is the sign-in screen, under the
  // bottom navigation that led there.
  return isPrivateHomeTab(tab) ? <AuthenticatedRoute>{page}</AuthenticatedRoute> : page;
}

function HomePageFallback() {
  return <div className="min-h-[100svh] bg-background" />;
}
