import { useEffect, useState } from "react";
import { create } from "zustand";

import { readStorageItem, writeStorageItem } from "#/lib/storage/local-storage";

export const CATALOG_VISIBILITY_STORAGE_KEY = "clc.catalog-visibility.v1";

export const CATALOG_VISIBILITIES = ["global", "1000", "500", "100", "50"] as const;

export type CatalogVisibility = (typeof CATALOG_VISIBILITIES)[number];

export const DEFAULT_CATALOG_VISIBILITY: CatalogVisibility = "500";

function isCatalogVisibility(value: unknown): value is CatalogVisibility {
  return CATALOG_VISIBILITIES.some((option) => option === value);
}

function readCatalogVisibility(): CatalogVisibility {
  const stored = readStorageItem(CATALOG_VISIBILITY_STORAGE_KEY);
  return isCatalogVisibility(stored) ? stored : DEFAULT_CATALOG_VISIBILITY;
}

type CatalogVisibilityState = {
  visibility: CatalogVisibility;
  setVisibility: (visibility: CatalogVisibility) => void;
};

export const useCatalogVisibilityStore = create<CatalogVisibilityState>((set) => ({
  visibility: DEFAULT_CATALOG_VISIBILITY,
  setVisibility: (visibility) => {
    writeStorageItem(CATALOG_VISIBILITY_STORAGE_KEY, visibility);
    set({ visibility });
  },
}));

/** Keep the server render stable, then reflect the device preference after mount. */
export function useHydratedCatalogVisibility() {
  const visibility = useCatalogVisibilityStore((state) => state.visibility);
  const setVisibility = useCatalogVisibilityStore((state) => state.setVisibility);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const initial = readCatalogVisibility();
    if (initial !== useCatalogVisibilityStore.getState().visibility) setVisibility(initial);
    setHydrated(true);
  }, [setVisibility]);

  return { visibility, setVisibility, hydrated };
}

export function catalogVisibilityRadiusKm(visibility: CatalogVisibility): number | null {
  return visibility === "global" ? null : Number(visibility);
}
