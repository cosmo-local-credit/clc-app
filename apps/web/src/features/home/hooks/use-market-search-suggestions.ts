import { isAccountNearbyScope } from "@clc/core/features/catalog/nearby";
import { marketplaceInfiniteQueryOptions } from "@clc/api/features/marketplace/queries";
import { parseCatalogFilter } from "@clc/core/features/catalog/logic";
import type { MarketplaceResult } from "@clc/core/features/marketplace/logic";
import { useInfiniteQuery } from "@tanstack/react-query";

import {
  isWithinNearbyCatalog,
  nearbyQueryPolicy,
  useNearbyCatalog,
  useNearbyCatalogFilter,
} from "#/components/nearby-catalog";
import { marketplaceClient } from "#/lib/api/marketplace";
import { useDebouncedValue } from "#/lib/use-debounced-value";

const SUGGESTION_ROWS = 10;
const SUGGESTED_VOUCHERS = 5;
const SUGGESTED_POOLS = 3;

export type VoucherSuggestion = Extract<MarketplaceResult, { kind: "voucher" }>;
export type PoolSuggestion = Extract<MarketplaceResult, { kind: "pool" }>;

/**
 * What the market's search screen offers while it is open: the tag vocabulary
 * at rest, and the vouchers and pools the marketplace search finds as the
 * draft settles. Both come from the marketplace endpoint the map already
 * searches, within the same nearby scope.
 */
export function useMarketSearchSuggestions(draft: string) {
  const nearby = useNearbyCatalog();
  const visibility = useNearbyCatalogFilter();
  const { settled } = useDebouncedValue(draft);
  const parsed = parseCatalogFilter({ q: settled });
  const term = parsed.ok ? parsed.filter.term : "";

  const vocabulary = useInfiniteQuery({
    ...marketplaceInfiniteQueryOptions(marketplaceClient, {
      perPage: 1,
      facets: true,
      nearby: isAccountNearbyScope(nearby),
      scope: nearby,
    }),
    ...nearbyQueryPolicy(nearby),
  });
  const matches = useInfiniteQuery({
    ...marketplaceInfiniteQueryOptions(marketplaceClient, {
      perPage: SUGGESTION_ROWS,
      q: term,
      kinds: ["voucher", "pool"],
      nearby: isAccountNearbyScope(nearby),
      scope: nearby,
    }),
    enabled: term !== "",
    ...nearbyQueryPolicy(nearby),
  });

  const rows =
    term === ""
      ? []
      : (matches.data?.pages[0]?.results ?? []).filter((row) =>
          isWithinNearbyCatalog(visibility, { lat: row.geoLat, lng: row.geoLng }),
        );

  return {
    tags: (vocabulary.data?.pages[0]?.tagFacets ?? [])
      .filter((facet) => facet.count > 0)
      .map((facet) => facet.tag),
    vouchers: rows
      .filter((row): row is VoucherSuggestion => row.kind === "voucher")
      .slice(0, SUGGESTED_VOUCHERS),
    pools: rows
      .filter((row): row is PoolSuggestion => row.kind === "pool")
      .slice(0, SUGGESTED_POOLS),
  };
}
