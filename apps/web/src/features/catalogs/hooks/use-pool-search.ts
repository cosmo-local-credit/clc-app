import { poolFilteredPageQueryOptions, poolKeys } from "@clc/api/features/pools/queries";
import type { UserPool } from "@clc/api/features/pools/client";
import type { CatalogFilter } from "@clc/core/features/catalog/logic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import { isRetryableBackendError } from "@clc/api/client/errors";
import { poolsClient } from "#/lib/api/pools";
import { useDebouncedValue } from "#/lib/use-debounced-value";

export const POOL_SEARCH_MIN_CHARS = 2;

const POOL_SEARCH_LIMIT = 10;
const POOL_SEARCH_STALE_TIME = 5 * 60_000;

type PoolSearchStatus = "idle" | "searching" | "ready" | "error";

export type PoolSearchControls = {
  query: string;
  setQuery: (next: string) => void;
  results: readonly UserPool[];
  status: PoolSearchStatus;
  retry: () => void;
  retrying: boolean;
};

/** Global pool lookup for compact resource pickers. */
export function usePoolSearch(
  query: string,
  setQuery: (next: string) => void,
  active: boolean,
): PoolSearchControls {
  const queryClient = useQueryClient();
  const { settled } = useDebouncedValue(query);
  const term = settled.trim();
  const currentTerm = query.trim();
  const isEligible = active && currentTerm.length >= POOL_SEARCH_MIN_CHARS;
  const isCurrent = term === currentTerm;
  const enabled = isEligible && isCurrent;
  const filter = useMemo<CatalogFilter>(
    () => ({ term, tags: [], tagMatch: "any", vouchers: [], voucherMatch: "any" }),
    [term],
  );
  const params = useMemo(() => ({ perPage: POOL_SEARCH_LIMIT, filter }), [filter]);

  useEffect(() => {
    if (enabled || term.length < POOL_SEARCH_MIN_CHARS) return;
    void queryClient.cancelQueries({ queryKey: poolKeys.filteredPage(params), exact: true });
  }, [enabled, params, queryClient, term.length]);

  const search = useQuery({
    ...poolFilteredPageQueryOptions(poolsClient, params),
    // A picker must not display the previous term while the new term settles.
    placeholderData: undefined,
    enabled,
    staleTime: POOL_SEARCH_STALE_TIME,
    refetchOnReconnect: false,
    retry: (failureCount, error) => failureCount < 1 && isRetryableBackendError(error),
  });

  return useMemo(() => {
    const status: PoolSearchStatus = !isEligible
      ? "idle"
      : !isCurrent || search.isPending
        ? "searching"
        : search.isError
          ? "error"
          : "ready";

    return {
      query,
      setQuery,
      results: status === "ready" ? (search.data?.pools ?? []) : [],
      status,
      retry: () => void search.refetch(),
      retrying: search.isFetching,
    };
  }, [isCurrent, isEligible, query, search, setQuery]);
}
