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
  mapSearchFrom,
  parseMarketplaceScope,
  pickMarketplaceSearch,
  type MarketplaceRouteSearch,
} from "#/lib/navigation/marketplace-search";
import { parseVoucherAddress } from "#/lib/navigation/voucher-sheet-search";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";

type MarketRouteSearch = MarketplaceRouteSearch & { voucher?: string };

function pickMarketRouteSearch(search: unknown): MarketRouteSearch {
  const marketplaceSearch = pickMarketplaceSearch(search);
  if (typeof search !== "object" || search === null || !("voucher" in search)) {
    return marketplaceSearch;
  }
  const voucher = (search as Record<string, unknown>).voucher;
  if (voucher === undefined) return marketplaceSearch;
  return {
    ...marketplaceSearch,
    voucher: typeof voucher === "string" ? voucher : "__invalid__",
  };
}

export const Route = createFileRoute("/_nav/market/")({
  staticData: { navOwner: "market" },
  validateSearch: (search): MarketRouteSearch => pickMarketRouteSearch(search),
  beforeLoad: ({ search }) => {
    const voucherAddress = parseVoucherAddress(search.voucher);
    if (voucherAddress) {
      throw redirect({
        to: "/vouchers/$voucherAddress",
        params: { voucherAddress },
        search: { from: "market" },
        replace: true,
      });
    }
    if (search.voucher !== undefined) {
      throw redirect({
        to: "/market",
        search: pickMarketplaceSearch(search),
        replace: true,
      });
    }
    // Without a list it knows, the market is the map; All is asked for by name.
    if (parseMarketplaceScope(search.scope) === null) {
      throw redirect({ to: "/", search: mapSearchFrom(search), replace: true });
    }
    const next = canonicalMarketplaceSearch(search);
    if (next) throw redirect({ to: "/market", search: next, replace: true });
  },
  component: MarketListRoute,
});

function MarketListRoute() {
  const auth = useAuthStatus();
  const search = Route.useSearch();
  const scope = parseMarketplaceScope(search.scope);
  const owner =
    auth.isAuthenticated && auth.address ? auth.address.toLowerCase() : GUEST_STORAGE_OWNER;
  if (scope === "catalogs") {
    return <CatalogsPage creditableSearch={search.creditable} />;
  }
  return (
    <NearbyCatalog allowMissingLocation>
      {scope === "offers" ? (
        <OffersPage creditableSearch={search.creditable} locationOwner={owner} />
      ) : scope === "vouchers" ? (
        <MarketListPage creditableSearch={search.creditable} locationOwner={owner} />
      ) : scope === "all" ? (
        <MarketplacePage creditableSearch={search.creditable} locationOwner={owner} />
      ) : (
        <div className="min-h-[100svh] bg-background px-4 pb-bottom-nav text-foreground">
          <PoolsPage
            creditableSearch={search.creditable}
            outputVoucherSearch={search.out_voucher}
          />
        </div>
      )}
    </NearbyCatalog>
  );
}
