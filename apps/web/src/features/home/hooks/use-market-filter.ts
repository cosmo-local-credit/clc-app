import { CATALOG_FILTER_PREFERENCE_KEYS } from "#/lib/navigation/catalog-filter-preference-storage";
import {
  type PersistedCatalogFilterControls,
  usePersistedCatalogFilter,
} from "#/lib/navigation/use-persisted-catalog-filter";

export const MARKET_FILTER_PREFERENCES_KEY = CATALOG_FILTER_PREFERENCE_KEYS.market;

export type MarketFilterControls = PersistedCatalogFilterControls;

/** Marketplace filter state with its own remembered facet selection. */
export function useMarketFilter(): MarketFilterControls {
  return usePersistedCatalogFilter(MARKET_FILTER_PREFERENCES_KEY);
}
