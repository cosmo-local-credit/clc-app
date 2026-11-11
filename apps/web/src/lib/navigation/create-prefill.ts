import type { ParsedPrefill } from "@clc/core/lib/prefill";
import { useLocation } from "@tanstack/react-router";
import { useMemo } from "react";

import { isWithinLinkBudget } from "./return-destination";

/**
 * The prefill a create link carries, or null.
 *
 * Read off the whole parsed search, not the route's validated slice, and
 * ignored entirely when the URL is over the link budget: the router keeps every
 * param `validateSearch` omits, so a short accepted prefill can still ride on a
 * long tail, and dropping fields to fit would choose arbitrarily.
 */
export function useCreatePrefill<V>(
  parse: (search: Record<string, unknown>) => ParsedPrefill<V, unknown> | null,
): V | null {
  const location = useLocation();
  const { pathname, searchStr, hash, search } = location;
  return useMemo(() => {
    if (!isWithinLinkBudget({ pathname, searchStr, hash })) return null;
    return parse(search as Record<string, unknown>)?.values ?? null;
  }, [hash, parse, pathname, search, searchStr]);
}

/**
 * Whether a later step was opened with a prefill, which `beforeLoad` sends back
 * to the first step: `$step` is one route, so `/review?v=1&name=…` would
 * otherwise seed a valid name and the step guard, which checks only the name,
 * would let it stay on review.
 */
export function carriesPrefill(search: Record<string, unknown>): boolean {
  return search.v !== undefined;
}
