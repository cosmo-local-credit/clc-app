import { lazy } from "react";

import type { MarketListScope } from "#/lib/navigation/marketplace-search";
import {
  type MarketView,
  resolveMarketView,
  useCompleteMarketViewUrl,
} from "#/desktop/market/market-view";

const MarketMapDesk = lazy(() =>
  import("#/desktop/market/market-map-desk").then((module) => ({ default: module.MarketMapDesk })),
);
const MarketListDesk = lazy(() =>
  import("#/desktop/market/market-list-desk").then((module) => ({
    default: module.MarketListDesk,
  })),
);

/**
 * The /market page on desktop: the map or the list of one marketplace scope.
 * The view is the URL's, else the one the person last used, else (a first
 * visit) the map. A list is keyed by its scope, so changing scope starts that
 * list's own page chain instead of keeping the previous scope's rows under the
 * new scope's columns; the map keeps its camera and its retained markers.
 */
export function MarketDesk({
  scope,
  urlView,
  isAuthenticated,
  creditableSearch,
  outputVoucherSearch,
  locationOwner,
}: {
  scope: MarketListScope | null;
  urlView: MarketView | undefined;
  isAuthenticated: boolean;
  creditableSearch?: boolean | string | readonly (boolean | string)[];
  outputVoucherSearch?: string | readonly string[];
  locationOwner: string;
}) {
  const view = resolveMarketView(urlView);
  useCompleteMarketViewUrl(view, urlView);
  if (view === "list" && scope) {
    return (
      <MarketListDesk
        key={scope}
        scope={scope}
        creditableSearch={creditableSearch}
        outputVoucherSearch={outputVoucherSearch}
        locationOwner={locationOwner}
      />
    );
  }
  return (
    <MarketMapDesk
      isAuthenticated={isAuthenticated}
      creditableSearch={creditableSearch}
      outputVoucherSearch={outputVoucherSearch}
      scope={scope ?? "all"}
      creditRoute="market"
    />
  );
}
