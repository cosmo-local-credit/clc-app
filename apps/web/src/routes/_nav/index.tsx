import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { canonicalRedirectSearch } from "#/lib/navigation/catalog-search";
import {
  pickMarketplaceSearch,
  type MarketplaceRouteSearch,
} from "#/lib/navigation/marketplace-search";
import {
  type HomeRouteSearch,
  isPrivateHomeTab,
  parseHomeSearch,
} from "#/lib/navigation/home-tabs";
import { parseVoucherAddress } from "#/lib/navigation/voucher-sheet-search";
import { parseWantId } from "#/lib/navigation/want-sheet-search";
import {
  canonicalActivityRouteSearch,
  clearActivityRouteSearch,
  parseActivitySearch,
} from "#/lib/navigation/activity-search";

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
    const wantId = parseWantId(search.want);
    const isMarketMap = search.tab === "market" && search.view === "map";
    if (wantId && !isMarketMap) {
      throw redirect({
        to: "/wants/$wantId",
        params: { wantId },
        search: { from: search.tab === "wallet" ? "wallet" : "market" },
        replace: true,
      });
    }
    if (search.want !== undefined && !wantId) {
      throw redirect({ to: "/", search: { ...search, want: undefined }, replace: true });
    }
    if (wantId && search.voucher !== undefined) {
      throw redirect({
        to: "/",
        search: { ...search, voucher: undefined },
        replace: true,
      });
    }
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
    // The retired list view of the map: the map is the market now.
    if (search.view === "list") {
      throw redirect({ to: "/", search: { ...search, view: undefined }, replace: true });
    }
    const activityCanonical = canonicalActivityRouteSearch(search);
    if (search.tab === "activity" && activityCanonical) {
      throw redirect({ to: "/", search: { ...search, ...activityCanonical }, replace: true });
    }
    if (
      search.tab !== "activity" &&
      (search.activityQ !== undefined || search.activityTypes !== undefined)
    ) {
      throw redirect({
        to: "/",
        search: { ...search, ...clearActivityRouteSearch() },
        replace: true,
      });
    }
    const next = canonicalRedirectSearch(search, {
      voucherRelationships: search.tab === "posts",
      poolRelationships: search.tab === "posts",
    });
    if (!next) return;
    throw redirect({ to: "/", search: next, replace: true });
  },
  component: IndexPage,
});

function IndexPage() {
  const auth = useAuthStatus();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { tab = "market", creditable } = search;
  const activity = parseActivitySearch(search);

  if (auth.isLoading) return <HomePageFallback />;

  const page = (
    <Suspense fallback={<HomePageFallback />}>
      <HomePage
        activeTab={tab}
        isAuthenticated={auth.isAuthenticated}
        creditableSearch={creditable}
        activityQ={activity.q}
        activityTypes={activity.types}
        onActivityQueryChange={(activityQ) =>
          navigate({
            search: (previous) => ({ ...previous, activityQ: activityQ || undefined }),
            replace: true,
          })
        }
        onActivityTypesChange={(activityTypes) =>
          navigate({
            search: (previous) => ({
              ...previous,
              activityTypes: activityTypes.length ? activityTypes.join(",") : undefined,
            }),
          })
        }
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
