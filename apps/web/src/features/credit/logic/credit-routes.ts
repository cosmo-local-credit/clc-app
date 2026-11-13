import type {
  CreditRoute,
  CreditRouteInput,
  CreditRoutesPage,
} from "@clc/api/features/credit-router/client";
import type { CreditRouteHopRef } from "@clc/core/features/credit-router/logic";

/**
 * Routes grouped by the voucher they spend, in the server's order. A page
 * holds at most 50 routes across groups, so one voucher's routes can continue
 * on the next page; they join its group rather than repeating the header.
 */
export function mergeCreditRouteGroups(
  pages: readonly CreditRoutesPage[] | undefined,
): CreditRouteInput[] {
  const groups: CreditRouteInput[] = [];
  const byVoucher = new Map<string, CreditRouteInput>();
  for (const page of pages ?? []) {
    for (const input of page.inputs) {
      const key = input.voucher.toLowerCase();
      const existing = byVoucher.get(key);
      if (existing) {
        existing.routes.push(...input.routes);
        continue;
      }
      const group = { ...input, routes: [...input.routes] };
      byVoucher.set(key, group);
      groups.push(group);
    }
  }
  return groups;
}

/**
 * A route's identity across listings: its ordered pools and vouchers. The
 * same route listed with and without an amount keeps its key, so a choice
 * survives typing.
 */
export function creditRouteKey(route: Pick<CreditRoute, "hops">): string {
  return route.hops
    .map((hop) =>
      [hop.pool.address, hop.tokenIn, hop.tokenOut].map((part) => part.toLowerCase()).join(":"),
    )
    .join("/");
}

/** The hops as a quote request names them. */
export function creditRouteHopRefs(route: Pick<CreditRoute, "hops">): CreditRouteHopRef[] {
  return route.hops.map((hop) => ({
    pool: hop.pool.address,
    tokenIn: hop.tokenIn,
    tokenOut: hop.tokenOut,
  }));
}

/** Every voucher a route touches, in order: input, bridges, output. */
export function creditRouteVouchers(route: Pick<CreditRoute, "hops">): `0x${string}`[] {
  return [route.hops[0]!.tokenIn, ...route.hops.map((hop) => hop.tokenOut)];
}
