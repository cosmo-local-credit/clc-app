import type { TagMatch, VoucherRef } from "@clc/core/features/catalog/logic";
import { serializeVoucherRef } from "@clc/core/features/catalog/logic";
import { useCallback, useEffect, useRef, useState } from "react";

import { MARKET_FILTER_PREFERENCES_NAME } from "#/features/home/hooks/use-market-filter";
import {
  CATALOG_FILTER_PREFERENCE_NAMES,
  clearCatalogFilterPreference,
  readCatalogFilterPreference,
  writeCatalogFilterPreference,
} from "#/lib/navigation/catalog-filter-preference-storage";
import { useCatalogFilter } from "#/lib/navigation/use-catalog-filter";
import type { PersistedCatalogFilterControls } from "#/lib/navigation/use-persisted-catalog-filter";
import type { StorageOwner } from "#/lib/storage/owner-tier-key";

/**
 * Marketplace categories remain Marketplace preferences while Post Voucher and
 * Pool relationships share the Posts preference. The URL is still the active
 * visit's single source of truth.
 */
export function useMarketPostFilter(
  owner: StorageOwner | null,
  externalFilterActive = false,
): PersistedCatalogFilterControls {
  const filter = useCatalogFilter({ voucherRelationships: true, poolRelationships: true });
  const checkedOwner = useRef<StorageOwner | undefined>(undefined);
  const restoringTarget = useRef<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (owner === null || checkedOwner.current === owner) return;
    checkedOwner.current = owner;
    if (filter.isFiltered || externalFilterActive) return;

    const market = readCatalogFilterPreference(owner, MARKET_FILTER_PREFERENCES_NAME);
    const posts = readCatalogFilterPreference(owner, CATALOG_FILTER_PREFERENCE_NAMES.posts);
    const tags = market?.tags ?? [];
    const vouchers = posts?.vouchers ?? [];
    const pools = posts?.pools ?? [];
    if (tags.length === 0 && vouchers.length === 0 && pools.length === 0) return;

    restoringTarget.current = preferenceKey(
      tags,
      market?.tagMatch ?? "any",
      vouchers,
      posts?.voucherMatch ?? "any",
      pools,
      posts?.poolMatch ?? "any",
    );
    setRestoring(true);
    filter.setResourceFacets(
      tags,
      market?.tagMatch ?? "any",
      vouchers,
      posts?.voucherMatch ?? "any",
      pools,
      posts?.poolMatch ?? "any",
      { replace: true },
    );
  }, [externalFilterActive, filter.isFiltered, filter.setResourceFacets, owner]);

  useEffect(() => {
    if (
      !restoring ||
      filter.isDebouncing ||
      restoringTarget.current !==
        preferenceKey(
          filter.tags,
          filter.tagMatch,
          filter.vouchers,
          filter.voucherMatch,
          filter.pools,
          filter.poolMatch,
        )
    ) {
      return;
    }
    restoringTarget.current = null;
    setRestoring(false);
  }, [
    filter.isDebouncing,
    filter.poolMatch,
    filter.pools,
    filter.tagMatch,
    filter.tags,
    filter.voucherMatch,
    filter.vouchers,
    restoring,
  ]);

  const remember = useCallback(
    (
      tags: readonly string[],
      tagMatch: TagMatch,
      vouchers: readonly VoucherRef[],
      voucherMatch: TagMatch,
      pools: readonly VoucherRef[],
      poolMatch: TagMatch,
    ) => {
      if (owner === null) return;
      writeCatalogFilterPreference(
        owner,
        MARKET_FILTER_PREFERENCES_NAME,
        tags,
        tagMatch,
        [],
        "any",
      );
      const posts = readCatalogFilterPreference(owner, CATALOG_FILTER_PREFERENCE_NAMES.posts);
      writeCatalogFilterPreference(
        owner,
        CATALOG_FILTER_PREFERENCE_NAMES.posts,
        posts?.tags ?? [],
        posts?.tagMatch ?? "any",
        vouchers,
        voucherMatch,
        pools,
        poolMatch,
      );
    },
    [owner],
  );

  const applyResourceFilters = useCallback(
    (
      tags: readonly string[],
      tagMatch: TagMatch,
      vouchers: readonly VoucherRef[],
      voucherMatch: TagMatch,
      pools: readonly VoucherRef[],
      poolMatch: TagMatch,
    ) => {
      remember(tags, tagMatch, vouchers, voucherMatch, pools, poolMatch);
      filter.setResourceFacets(tags, tagMatch, vouchers, voucherMatch, pools, poolMatch);
    },
    [filter.setResourceFacets, remember],
  );

  const applyFacetFilters = useCallback(
    (
      tags: readonly string[],
      tagMatch: TagMatch,
      vouchers: readonly VoucherRef[],
      voucherMatch: TagMatch,
    ) =>
      applyResourceFilters(tags, tagMatch, vouchers, voucherMatch, filter.pools, filter.poolMatch),
    [applyResourceFilters, filter.poolMatch, filter.pools],
  );

  const clear = useCallback(() => {
    if (owner !== null) {
      clearCatalogFilterPreference(owner, MARKET_FILTER_PREFERENCES_NAME);
      const posts = readCatalogFilterPreference(owner, CATALOG_FILTER_PREFERENCE_NAMES.posts);
      writeCatalogFilterPreference(
        owner,
        CATALOG_FILTER_PREFERENCE_NAMES.posts,
        posts?.tags ?? [],
        posts?.tagMatch ?? "any",
        [],
        "any",
        [],
        "any",
      );
    }
    filter.clear();
  }, [filter.clear, owner]);

  return {
    ...filter,
    isRestoringPreference: restoring,
    applyFacetFilters,
    applyResourceFilters,
    clear,
  };
}

function preferenceKey(
  tags: readonly string[],
  tagMatch: TagMatch,
  vouchers: readonly VoucherRef[],
  voucherMatch: TagMatch,
  pools: readonly VoucherRef[],
  poolMatch: TagMatch,
): string {
  return JSON.stringify({
    tags: [...tags].sort(),
    tagMatch,
    vouchers: vouchers.map(serializeVoucherRef).sort(),
    voucherMatch,
    pools: pools.map(serializeVoucherRef).sort(),
    poolMatch,
  });
}
