import { queryOptions } from "@tanstack/react-query";
import type { SymbolKind, SymbolScope, SymbolsClient } from "./client";

export const symbolKeys = {
  all: ["clc", "symbols"] as const,
  taken: (kind: SymbolKind, prefix: string, scope?: SymbolScope) =>
    ["clc", "symbols", "taken", kind, prefix, ...(scope ? [scope] : [])] as const,
} as const;

/**
 * Thirty seconds of freshness lets the submit re-check reuse the lookup the
 * name blur already made, while a deploy that lands in between is still caught
 * on the next form.
 */
export function takenSymbolsQueryOptions(
  symbols: SymbolsClient,
  kind: SymbolKind,
  prefix: string,
  scope?: SymbolScope,
) {
  return queryOptions({
    queryKey: symbolKeys.taken(kind, prefix, scope),
    queryFn: ({ signal }) => symbols.getTakenSymbols(kind, prefix, { signal, scope }),
    staleTime: 30_000,
    retry: false,
  });
}
