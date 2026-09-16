import type { UseQueryResult } from "@tanstack/react-query";
import { type DataState, resolveDataState } from "#/lib/data-state";

/**
 * Bridges a TanStack Query result to a DataState.
 *
 * Kept separate from data-state.ts so the resolution logic stays a pure function
 * testable without a query client. `hasData` is derived from `data !== undefined`
 * rather than `isSuccess`, because a failed refetch leaves `isError` true while
 * the previous result is still cached — which is exactly the `stale` case.
 */
export function useDataState<TData>(
  query: Pick<UseQueryResult<TData>, "isPending" | "isError" | "error" | "data">,
  isEmpty: (data: TData) => boolean,
): DataState {
  return resolveDataState(
    {
      isPending: query.isPending,
      isError: query.isError,
      error: query.error,
      hasData: query.data !== undefined,
    },
    query.data === undefined ? true : isEmpty(query.data),
  );
}
