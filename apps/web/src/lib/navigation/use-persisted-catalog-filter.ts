import type { TagMatch, VoucherRef } from "@clc/core/features/catalog/logic";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  clearCatalogFilterPreference,
  readCatalogFilterPreference,
  writeCatalogFilterPreference,
  type CatalogFilterPreference,
} from "#/lib/navigation/catalog-filter-preference-storage";
import { useCatalogFilter, type CatalogFilterControls } from "#/lib/navigation/use-catalog-filter";

export type PersistedCatalogFilterControls = Omit<CatalogFilterControls, "clear"> & {
  /** True until client storage has been checked and any saved preference reaches the URL. */
  isRestoringPreference: boolean;
  /** Applies the sheet's complete draft and remembers it for a later visit. */
  applyFacetFilters: (
    tags: readonly string[],
    tagMatch: TagMatch,
    vouchers: readonly VoucherRef[],
    voucherMatch: TagMatch,
  ) => void;
  /** Clears both the current URL filter and this catalog's remembered preference. */
  clear: () => void;
};

/**
 * Catalog preference persistence around the shared URL filter controller.
 *
 * The URL remains the source of truth for an active visit. Storage is read only when a
 * catalog mounts without a filter, so an explicit or shared link always wins. See
 * {@link readCatalogFilterPreference} for what is stored and why it is not a store.
 */
export function usePersistedCatalogFilter(
  storageKey: string,
  options?: { voucherRelationships?: boolean },
): PersistedCatalogFilterControls {
  const filter = useCatalogFilter(options);
  const voucherRelationships = options?.voucherRelationships === true;
  const checkedStorage = useRef(false);
  const [preferenceToRestore, setPreferenceToRestore] = useState<
    CatalogFilterPreference | null | undefined
  >(undefined);

  useEffect(() => {
    if (checkedStorage.current) return;
    checkedStorage.current = true;

    if (filter.isFiltered) {
      setPreferenceToRestore(null);
      return;
    }

    const storedPreference = readCatalogFilterPreference(storageKey);
    if (!storedPreference) {
      setPreferenceToRestore(null);
      return;
    }

    const preference = voucherRelationships
      ? storedPreference
      : { ...storedPreference, vouchers: [], voucherMatch: "any" as const };
    if (preference.tags.length === 0 && preference.vouchers.length === 0) {
      clearCatalogFilterPreference(storageKey);
      setPreferenceToRestore(null);
      return;
    }
    if (!voucherRelationships && storedPreference.vouchers.length > 0) {
      writeCatalogFilterPreference(
        storageKey,
        preference.tags,
        preference.tagMatch,
        preference.vouchers,
        preference.voucherMatch,
      );
    }

    setPreferenceToRestore(preference);
    // Restoration normalizes the current route rather than adding a Back entry.
    filter.setFacets(
      preference.tags,
      preference.tagMatch,
      preference.vouchers,
      preference.voucherMatch,
      { replace: true },
    );
  }, [filter.isFiltered, filter.setFacets, storageKey, voucherRelationships]);

  useEffect(() => {
    if (!preferenceToRestore) return;
    if (
      filter.tagMatch === preferenceToRestore.tagMatch &&
      filter.tags.length === preferenceToRestore.tags.length &&
      filter.tags.every((tag, index) => tag === preferenceToRestore.tags[index]) &&
      filter.voucherMatch === preferenceToRestore.voucherMatch &&
      filter.vouchers.length === preferenceToRestore.vouchers.length &&
      filter.vouchers.every(
        (voucher, index) =>
          voucher.chainId === preferenceToRestore.vouchers[index]?.chainId &&
          voucher.address === preferenceToRestore.vouchers[index]?.address,
      )
    ) {
      setPreferenceToRestore(null);
    }
  }, [filter.tagMatch, filter.tags, filter.voucherMatch, filter.vouchers, preferenceToRestore]);

  const applyFacetFilters = useCallback(
    (
      tags: readonly string[],
      tagMatch: TagMatch,
      vouchers: readonly VoucherRef[],
      voucherMatch: TagMatch,
    ) => {
      writeCatalogFilterPreference(storageKey, tags, tagMatch, vouchers, voucherMatch);
      filter.setFacets(tags, tagMatch, vouchers, voucherMatch);
    },
    [filter.setFacets, storageKey],
  );

  const clear = useCallback(() => {
    clearCatalogFilterPreference(storageKey);
    filter.clear();
  }, [filter.clear, storageKey]);

  return {
    ...filter,
    isRestoringPreference: preferenceToRestore !== null,
    applyFacetFilters,
    clear,
  };
}
