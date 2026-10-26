import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy } from "react";

import { NearbyCatalog } from "#/components/nearby-catalog";
import { LayoutSwitch } from "#/desktop/switch";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { CatalogsPage } from "#/features/catalogs/ui/catalogs-page";
import { MarketListPage } from "#/features/home/ui/market-list-page";
import { MarketplacePage } from "#/features/home/ui/marketplace-page";
import { OffersPage } from "#/features/home/ui/offers-page";
import { PoolsPage } from "#/features/pools/ui";
import { WantsPage } from "#/features/wants/ui/wants-page";
import {
  canonicalMarketplaceSearch,
  mapSearchFrom,
  parseMarketplaceScope,
  pickMarketplaceSearch,
  type MarketplaceRouteSearch,
} from "#/lib/navigation/marketplace-search";
import { parseVoucherAddress } from "#/lib/navigation/voucher-sheet-search";
import { parseWantId } from "#/lib/navigation/want-sheet-search";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";

const MarketMapDesk = lazy(() =>
  import("#/desktop/market/market-map-desk").then((module) => ({ default: module.MarketMapDesk })),
);
const MarketListDesk = lazy(() =>
  import("#/desktop/market/market-list-desk").then((module) => ({
    default: module.MarketListDesk,
  })),
);

type MarketViewParam = "map" | "list";

type MarketRouteSearch = MarketplaceRouteSearch & {
  voucher?: string;
  want?: string;
  view?: MarketViewParam;
};

function pickView(search: unknown): MarketViewParam | undefined {
  if (typeof search !== "object" || search === null || !("view" in search)) return undefined;
  const view = (search as Record<string, unknown>).view;
  return view === "map" || view === "list" ? view : undefined;
}

function pickMarketRouteSearch(search: unknown): MarketRouteSearch {
  const marketplaceSearch = pickMarketplaceSearch(search);
  const view = pickView(search);
  const withView = view ? { ...marketplaceSearch, view } : marketplaceSearch;
  if (typeof search !== "object" || search === null) return withView;
  const record = search as Record<string, unknown>;
  const voucher = "voucher" in record ? record.voucher : undefined;
  const want = "want" in record ? record.want : undefined;
  return {
    ...withView,
    ...(voucher !== undefined
      ? { voucher: typeof voucher === "string" ? voucher : "__invalid__" }
      : {}),
    ...(want !== undefined ? { want: typeof want === "string" ? want : "__invalid__" } : {}),
  };
}

export const Route = createFileRoute("/_nav/market/")({
  staticData: { navOwner: "market", desktop: "map" },
  validateSearch: (search): MarketRouteSearch => pickMarketRouteSearch(search),
  beforeLoad: ({ search }) => {
    // view=map and view=list keep the sheet params. A voucher on the bare list
    // URL is still the old card link and goes to the voucher page.
    const keepsSheet = search.view === "map" || search.view === "list";
    const voucherAddress = parseVoucherAddress(search.voucher);
    if (voucherAddress && !keepsSheet) {
      throw redirect({
        to: "/vouchers/$voucherAddress",
        params: { voucherAddress },
        search: { from: "market" },
        replace: true,
      });
    }
    if (search.voucher !== undefined && !voucherAddress) {
      throw redirect({
        to: "/market",
        search: { ...pickMarketplaceSearch(search), ...(search.view ? { view: search.view } : {}) },
        replace: true,
      });
    }
    if (search.want !== undefined && !parseWantId(search.want)) {
      throw redirect({
        to: "/market",
        search: { ...pickMarketplaceSearch(search), ...(search.view ? { view: search.view } : {}) },
        replace: true,
      });
    }
    if (search.want !== undefined && !keepsSheet) {
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
    if (next) {
      throw redirect({
        to: "/market",
        search: {
          ...next,
          ...(search.view ? { view: search.view } : {}),
          ...(keepsSheet && voucherAddress ? { voucher: voucherAddress } : {}),
          ...(keepsSheet && search.want ? { want: search.want } : {}),
        },
        replace: true,
      });
    }
  },
  component: MarketListRoute,
});

function MarketListRoute() {
  const auth = useAuthStatus();
  const search = Route.useSearch();
  const scope = parseMarketplaceScope(search.scope);
  const owner =
    auth.isAuthenticated && auth.address ? auth.address.toLowerCase() : GUEST_STORAGE_OWNER;
  const mobile = <MarketMobile scope={scope} search={search} owner={owner} />;
  const desktop =
    search.view === "list" && scope ? (
      <NearbyCatalog>
        <MarketListDesk scope={scope} creditableSearch={search.creditable} locationOwner={owner} />
      </NearbyCatalog>
    ) : (
      <NearbyCatalog>
        <MarketMapDesk
          isAuthenticated={auth.isAuthenticated}
          creditableSearch={search.creditable}
          scope={scope ?? "all"}
          creditRoute="market"
          view={search.view}
        />
      </NearbyCatalog>
    );
  return <LayoutSwitch mobile={mobile} desktop={desktop} />;
}

function MarketMobile({
  scope,
  search,
  owner,
}: {
  scope: ReturnType<typeof parseMarketplaceScope>;
  search: MarketRouteSearch;
  owner: string;
}) {
  if (scope === "catalogs") {
    return <CatalogsPage creditableSearch={search.creditable} />;
  }
  if (scope === "wants") {
    return (
      <NearbyCatalog>
        <WantsPage creditableSearch={search.creditable} />
      </NearbyCatalog>
    );
  }
  return (
    <NearbyCatalog>
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
