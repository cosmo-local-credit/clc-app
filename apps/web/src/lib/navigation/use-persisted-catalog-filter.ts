import type { TagMatch, VoucherRef } from "@clc/core/features/catalog/logic";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  clearCatalogFilterPreference,
  readCatalogFilterPreference,
  writeCatalogFilterPreference,
  type CatalogFilterPreference,
} from "#/lib/navigation/catalog-filter-preference-storage";
import { useCatalogFilter, type CatalogFilterControls } from "#/lib/navigation/use-catalog-filter";
import type { StorageOwner } from "#/lib/storage/owner-tier-key";

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
 *
 * `owner` is null while the session is still being decided. That case must not
 * latch the one-shot below: these are public screens gated on
 * `!isRestoringPreference`, so a session check that never resolves would
 * otherwise pin the gate shut and render a permanently empty market.
 */
export function usePersistedCatalogFilter(
  name: string,
  owner: StorageOwner | null,
  options?: { voucherRelationships?: boolean; externalFilterActive?: boolean },
): PersistedCatalogFilterControls {
  const filter = useCatalogFilter(options);
  const voucherRelationships = options?.voucherRelationships === true;
  const checkedStorage = useRef(false);
  const [preferenceToRestore, setPreferenceToRestore] = useState<
    CatalogFilterPreference | null | undefined
  >(undefined);

  useEffect(() => {
    if (checkedStorage.current) return;

    if (owner === null) {
      // Deliberately without latching `checkedStorage`: stop restoring so the
      // catalog renders unfiltered now, and run for real once the owner resolves.
      setPreferenceToRestore(null);
      return;
    }

    checkedStorage.current = true;

    if (filter.isFiltered || options?.externalFilterActive) {
      setPreferenceToRestore(null);
      return;
    }

    const storedPreference = readCatalogFilterPreference(owner, name);
    if (!storedPreference) {
      setPreferenceToRestore(null);
      return;
    }

    const preference = voucherRelationships
      ? storedPreference
      : { ...storedPreference, vouchers: [], voucherMatch: "any" as const };
    if (preference.tags.length === 0 && preference.vouchers.length === 0) {
      clearCatalogFilterPreference(owner, name);
      setPreferenceToRestore(null);
      return;
    }
    if (!voucherRelationships && storedPreference.vouchers.length > 0) {
      writeCatalogFilterPreference(
        owner,
        name,
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
  }, [
    filter.isFiltered,
    filter.setFacets,
    name,
    owner,
    options?.externalFilterActive,
    voucherRelationships,
  ]);

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
      // The URL still updates when the owner is undecided; only the memory of
      // the choice waits, rather than being filed under the wrong person.
      if (owner !== null) {
        writeCatalogFilterPreference(owner, name, tags, tagMatch, vouchers, voucherMatch);
      }
      filter.setFacets(tags, tagMatch, vouchers, voucherMatch);
    },
    [filter.setFacets, name, owner],
  );

  const clear = useCallback(() => {
    if (owner !== null) clearCatalogFilterPreference(owner, name);
    filter.clear();
  }, [filter.clear, name, owner]);

  return {
    ...filter,
    isRestoringPreference: preferenceToRestore !== null,
    applyFacetFilters,
    clear,
  };
}
