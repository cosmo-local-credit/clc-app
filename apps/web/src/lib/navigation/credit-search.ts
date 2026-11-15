import { parseCredit } from "#/lib/navigation/pool-search";

/**
 * The Credit filter a detail, Get or receipt screen carries so the market it
 * was opened from comes back filtered the same way: `credit: 1` while on,
 * absent while off. An older link's `creditDepth` or `creditable` reads the
 * way the market reads it. These screens do not filter by Credit themselves.
 * The routes that declare it also retain it (`retainSearchParams(["credit"])`),
 * so map sheets, details, related resources, Get and its receipt keep Credit;
 * setting it explicitly, to undefined to clear, still wins.
 */
export function creditSearch(search: Record<string, unknown>): { credit?: 1 } {
  if (parseCredit(search)) return { credit: 1 };
  // A malformed `credit` is written out as off so it cannot show through; an
  // absent one stays absent, which is what lets a retained Credit apply.
  return "credit" in search ? { credit: undefined } : {};
}
