import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { CLEARED_CATALOG_SEARCH } from "#/lib/navigation/catalog-search";

/**
 * Drops, in one replace, everything that narrows the marketplace in the URL:
 * the search, the tags, Credit and the requested output voucher. Clear filters
 * runs it after the catalog filter's own reset, so the two navigations end in
 * the same fully cleared state whichever the router applies last.
 */
export function useClearMarketNarrowing() {
  const navigate = useNavigate();
  return useCallback(
    () =>
      void navigate({
        to: ".",
        replace: true,
        search: (previous) => ({
          ...previous,
          ...CLEARED_CATALOG_SEARCH,
          creditable: undefined,
          out_voucher: undefined,
        }),
      }),
    [navigate],
  );
}

/** Removes only the requested output voucher, the way its chip does. */
export function useClearOutputVoucher() {
  const navigate = useNavigate();
  return useCallback(
    () =>
      void navigate({
        to: ".",
        replace: true,
        search: (previous) => ({ ...previous, out_voucher: undefined }),
      }),
    [navigate],
  );
}
