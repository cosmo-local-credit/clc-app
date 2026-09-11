import { queryOptions } from "@tanstack/react-query";
import type { SymbolKind, SymbolsClient } from "./client";

export const symbolKeys = {
  all: ["clc", "symbols"] as const,
  taken: (kind: SymbolKind, prefix: string) => ["clc", "symbols", "taken", kind, prefix] as const,
} as const;

/**
 * Thirty seconds of freshness lets the submit re-check reuse the lookup the
 * name blur already made, while a deploy that lands in between is still caught
 * on the next form.
 */
export function takenSymbolsQueryOptions(symbols: SymbolsClient, kind: SymbolKind, prefix: string) {
  return queryOptions({
    queryKey: symbolKeys.taken(kind, prefix),
    queryFn: ({ signal }) => symbols.getTakenSymbols(kind, prefix, { signal }),
    staleTime: 30_000,
    retry: false,
  });
}
