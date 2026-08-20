import type { CatalogFilter } from "@clc/core/features/catalog/logic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import { isRetryableBackendError } from "@clc/api/client/errors";
import { voucherKeys } from "@clc/api/features/market/queries";
import { type MarketVoucher } from "@clc/api/features/market/client";
import { useDebouncedValue } from "#/lib/use-debounced-value";
import { marketClient } from "#/lib/api/market";

/** Below this the list stays closed — a one-character query matches most of the catalog. */
export const VOUCHER_SEARCH_MIN_CHARS = 2;

/** One short page. The picker is for finding a known voucher, not for browsing the catalog. */
const VOUCHER_SEARCH_LIMIT = 10;

const VOUCHER_SEARCH_STALE_TIME = 5 * 60_000;

// Identity is canonical in @clc/api so a voucher deploy invalidation reaches
// search results too; the debounce and eligibility rules stay app-specific.
const voucherSearchQueryKeys = { term: voucherKeys.search };

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
export function useVoucherSearch(query: string, setQuery: (next: string) => void, active: boolean) {
  const queryClient = useQueryClient();
  const { settled } = useDebouncedValue(query);
  const term = settled.trim();
  const currentTerm = query.trim();
  const isEligible = active && currentTerm.length >= VOUCHER_SEARCH_MIN_CHARS;
  const isCurrent = term === currentTerm;
  const enabled = isEligible && isCurrent;

  useEffect(() => {
    if (enabled || term.length < VOUCHER_SEARCH_MIN_CHARS) return;
    void queryClient.cancelQueries({ queryKey: voucherSearchQueryKeys.term(term), exact: true });
  }, [enabled, queryClient, term]);

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
      const page = await marketClient.getFilteredMarketVouchers(
        { perPage: VOUCHER_SEARCH_LIMIT, filter },
        signal,
      );
      return page.vouchers;
    },
    enabled,
    staleTime: VOUCHER_SEARCH_STALE_TIME,
    refetchOnReconnect: false,
    retry: (failureCount, error) => failureCount < 1 && isRetryableBackendError(error),
  });

  return useMemo((): VoucherSearchControls => {
    // The raw input drives the affordance while the settled term drives the request. Results are
    // only exposed when both refer to the same term, so a clear or edit cannot leave an old list
    // visible during the debounce window.
    const status: VoucherSearchStatus = !isEligible
      ? "idle"
      : !isCurrent || search.isPending
        ? "searching"
        : search.isError
          ? "error"
          : "ready";

    return {
      query,
      setQuery,
      results: status === "ready" ? (search.data ?? []) : [],
      status,
      retry: () => void search.refetch(),
    };
  }, [isCurrent, isEligible, query, search, setQuery]);
}
