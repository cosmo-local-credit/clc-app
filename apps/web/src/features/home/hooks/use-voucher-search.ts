import type { CatalogFilter } from "@clc/core/features/catalog/logic";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { BackendApiError } from "#/features/auth/api/client";
import { type MarketVoucher, getFilteredMarketVouchers } from "#/features/home/api/market-client";
import { useDebouncedValue } from "#/lib/use-debounced-value";

/** Below this the list stays closed — a one-character query matches most of the catalog. */
export const VOUCHER_SEARCH_MIN_CHARS = 2;

/** One short page. The picker is for finding a known voucher, not for browsing the catalog. */
const VOUCHER_SEARCH_LIMIT = 10;

const VOUCHER_SEARCH_STALE_TIME = 5 * 60_000;

const voucherSearchQueryKeys = {
  all: ["market-vouchers", "search"] as const,
  term: (term: string) => [...voucherSearchQueryKeys.all, term] as const,
};

type VoucherSearchStatus = "idle" | "searching" | "ready" | "error";

export type VoucherSearchControls = {
  query: string;
  setQuery: (next: string) => void;
  results: readonly MarketVoucher[];
  status: VoucherSearchStatus;
  retry: () => void;
};

/**
 * Server-backed voucher lookup for the filter sheet.
 *
 * `GET /api/v2/vouchers` is public, per-IP rate limited, and cursor paginated, so the sheet never
 * holds a catalog in memory. Two consequences the caller must design around: results carry no
 * per-voucher match count, and the endpoint only sees active, geolocated vouchers.
 */
export function useVoucherSearch(query: string, setQuery: (next: string) => void) {
  const { settled } = useDebouncedValue(query);
  const term = settled.trim();
  const enabled = term.length >= VOUCHER_SEARCH_MIN_CHARS;

  const search = useQuery({
    queryKey: voucherSearchQueryKeys.term(term),
    queryFn: async ({ signal }) => {
      const filter: CatalogFilter = {
        term,
        tags: [],
        tagMatch: "any",
        vouchers: [],
        voucherMatch: "any",
      };
      const page = await getFilteredMarketVouchers(
        { perPage: VOUCHER_SEARCH_LIMIT, filter },
        signal,
      );
      return page.vouchers;
    },
    enabled,
    placeholderData: keepPreviousData,
    staleTime: VOUCHER_SEARCH_STALE_TIME,
    refetchOnReconnect: false,
    retry: (failureCount, error) =>
      error instanceof BackendApiError && error.status >= 400 && error.status < 500
        ? false
        : failureCount < 1,
  });

  return useMemo((): VoucherSearchControls => {
    // The trimmed term drives the request, but the raw query drives the affordance: a user who has
    // typed two characters should not see "type to search" while the debounce settles.
    const status: VoucherSearchStatus = !enabled
      ? "idle"
      : search.isError
        ? "error"
        : search.data === undefined || search.isPlaceholderData || settled !== query
          ? "searching"
          : "ready";

    return {
      query,
      setQuery,
      results: search.data ?? [],
      status,
      retry: () => void search.refetch(),
    };
  }, [enabled, query, search, setQuery, settled]);
}
