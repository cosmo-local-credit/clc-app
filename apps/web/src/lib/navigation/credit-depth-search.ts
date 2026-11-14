import { z } from "zod";

import { type CreditDepthValue, parseCreditDepth } from "#/lib/navigation/pool-search";

/**
 * The Credit depth a detail, Get or receipt screen carries so the market it
 * was opened from comes back filtered the same way. Anything but 1 or 2 reads
 * as off: these screens do not filter by Credit themselves. The routes that
 * declare it also retain it (`retainSearchParams(["creditDepth"])`), so map
 * sheets, details, related resources, Get and its receipt keep the depth the
 * person chose; setting it explicitly, to undefined to clear, still wins.
 */
export const creditDepthSearchParam = z
  .unknown()
  .transform((value): CreditDepthValue | undefined => {
    const parsed = parseCreditDepth(value as never);
    return parsed.ok ? (parsed.depth ?? undefined) : undefined;
  })
  .optional();
