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

/**
 * How far a voucher's routes are priced at the entered amount: `idle` before
 * any amount, `pending` while the routes answer without it, `priced` once
 * every route says whether it carries it.
 */
export type CreditPricing = "idle" | "pending" | "priced";

/**
 * One voucher the wallet could pay with: the route that stands for it, the
 * voucher's other routes, and whether that route takes the entered amount.
 */
export type CreditPayOption = {
  voucher: `0x${string}`;
  walletBalance: string;
  route: CreditRoute;
  others: CreditRoute[];
  state: "idle" | "pending" | "carries" | "refused";
};

/**
 * The option a voucher's group makes. Its route is the one the person chose,
 * while it is still listed; otherwise the group's best: the first route, or
 * once priced the first that carries the amount. Null for a group with no
 * routes.
 */
export function creditPayOption(
  group: CreditRouteInput,
  pricing: CreditPricing,
  chosenKey?: string,
): CreditPayOption | null {
  const { routes } = group;
  const first = routes[0];
  if (!first) return null;
  const best =
    (pricing === "priced" ? routes.find((route) => route.carriesAmount !== false) : undefined) ??
    first;
  const route =
    (chosenKey ? routes.find((entry) => creditRouteKey(entry) === chosenKey) : undefined) ?? best;
  return {
    voucher: group.voucher,
    walletBalance: group.walletBalance,
    route,
    others: routes.filter((entry) => entry !== route),
    state: pricing === "priced" ? (route.carriesAmount === false ? "refused" : "carries") : pricing,
  };
}

/**
 * Why a priced route does not carry the amount: the wallet's balance, a
 * pool's stock or credit limit, or any other refusal. The route's refusal
 * decides; without one, its limit does.
 */
export function creditRouteShortfall(
  route: Pick<CreditRoute, "refusal" | "limitedBy">,
): "wallet" | "pool" | "other" {
  const reason = route.refusal?.reason ?? route.limitedBy;
  if (reason === "wallet_balance" || reason === "wallet") return "wallet";
  if (reason === "liquidity" || reason === "deposit_cap") return "pool";
  return "other";
}
