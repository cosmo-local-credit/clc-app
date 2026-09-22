import { deployNameKey } from "@clc/core/lib/deploy-name";
import { queryOptions } from "@tanstack/react-query";

import type { NameKind, NamesClient } from "./client";

export const nameKeys = {
  all: ["clc", "names"] as const,
  availability: (kind: NameKind, name: string, exclude?: string) =>
    ["clc", "names", "availability", kind, deployNameKey(name), exclude ?? null] as const,
} as const;

/**
 * Keyed on the folded name, so the debounced keystroke check and the re-check at
 * submit share one request. Thirty seconds mirrors the symbol lookup; a deploy
 * that lands inside that window is still caught by the backend's own check.
 */
export function nameAvailabilityQueryOptions(
  names: NamesClient,
  kind: NameKind,
  name: string,
  exclude?: string,
) {
  return queryOptions({
    queryKey: nameKeys.availability(kind, name, exclude),
    queryFn: ({ signal }) => names.getNameAvailability(kind, name, { signal, exclude }),
    staleTime: 30_000,
    retry: false,
  });
}
