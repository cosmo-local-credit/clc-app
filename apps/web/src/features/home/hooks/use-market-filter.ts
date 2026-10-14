import { CATALOG_FILTER_PREFERENCE_NAMES } from "#/lib/navigation/catalog-filter-preference-storage";
import {
  type PersistedCatalogFilterControls,
  usePersistedCatalogFilter,
} from "#/lib/navigation/use-persisted-catalog-filter";
import type { StorageOwner } from "#/lib/storage/owner-tier-key";

export const MARKET_FILTER_PREFERENCES_NAME = CATALOG_FILTER_PREFERENCE_NAMES.market;

export type MarketFilterControls = PersistedCatalogFilterControls;

/**
 * Marketplace filter state with its own remembered facet selection, per account.
 *
 * `owner` is a parameter rather than a `useStorageOwner()` call inside, so this
 * stays a hook over the URL and storage with no dependency on the session query
 * — the screens that render it supply the owner they already know.
 */
export function useMarketFilter(
  owner: StorageOwner | null,
  externalFilterActive = false,
): MarketFilterControls {
  return usePersistedCatalogFilter(MARKET_FILTER_PREFERENCES_NAME, owner, {
    externalFilterActive,
  });
}
