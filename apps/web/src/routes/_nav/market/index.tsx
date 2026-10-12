import { createFileRoute, redirect } from "@tanstack/react-router";

import { NearbyCatalog } from "#/components/nearby-catalog";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { CatalogsPage } from "#/features/catalogs/ui/catalogs-page";
import { MarketListPage } from "#/features/home/ui/market-list-page";
import { MarketplacePage } from "#/features/home/ui/marketplace-page";
import { OffersPage } from "#/features/home/ui/offers-page";
import { PoolsPage } from "#/features/pools/ui";
import {
  canonicalMarketplaceSearch,
  parseMarketplaceScope,
  pickMarketplaceSearch,
  type MarketplaceRouteSearch,
} from "#/lib/navigation/marketplace-search";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";

export const Route = createFileRoute("/_nav/market/")({
  staticData: { navOwner: "market" },
  validateSearch: (search): MarketplaceRouteSearch => pickMarketplaceSearch(search),
  beforeLoad: ({ search }) => {
    const next = canonicalMarketplaceSearch(search);
    if (next) throw redirect({ to: "/market", search: next, replace: true });
  },
  component: UnifiedMarketplaceRoute,
});

function UnifiedMarketplaceRoute() {
  const auth = useAuthStatus();
  const search = Route.useSearch();
  const scope = parseMarketplaceScope(search.scope);
  const owner =
    auth.isAuthenticated && auth.address ? auth.address.toLowerCase() : GUEST_STORAGE_OWNER;
  if (scope === "catalogs") {
    return <CatalogsPage creditableSearch={search.creditable} />;
  }
  return (
    <NearbyCatalog>
      {scope === "offers" ? (
        <OffersPage creditableSearch={search.creditable} locationOwner={owner} />
      ) : scope === "vouchers" ? (
        <MarketListPage creditableSearch={search.creditable} locationOwner={owner} />
      ) : scope === "pools" ? (
        <div className="min-h-[100svh] bg-background px-4 pb-bottom-nav text-foreground">
          <PoolsPage
            creditableSearch={search.creditable}
            outputVoucherSearch={search.out_voucher}
          />
        </div>
      ) : (
        <MarketplacePage creditableSearch={search.creditable} />
      )}
    </NearbyCatalog>
  );
}
