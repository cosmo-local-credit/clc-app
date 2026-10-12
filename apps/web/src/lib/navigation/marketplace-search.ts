import {
  marketplaceScopeSchema,
  type MarketplaceScope,
} from "@clc/core/features/marketplace/logic";
import {
  canonicalPoolRedirectSearch,
  type PoolRouteSearch,
  pickPoolSearch,
} from "#/lib/navigation/pool-search";

export type MarketplaceRouteSearch = PoolRouteSearch & {
  scope?: string | readonly string[];
};

export function pickMarketplaceSearch(search: unknown): MarketplaceRouteSearch {
  const base = pickPoolSearch(search);
  if (typeof search !== "object" || search === null) return base;
  const value = (search as Record<string, unknown>).scope;
  if (typeof value === "string") return { ...base, scope: value };
  if (Array.isArray(value) && value.every((entry): entry is string => typeof entry === "string"))
    return { ...base, scope: value };
  return value === undefined ? base : { ...base, scope: ["__invalid__"] };
}

export function parseMarketplaceScope(
  value: MarketplaceRouteSearch["scope"],
): MarketplaceScope | null {
  if (value === undefined || value === "all") return null;
  if (typeof value !== "string") return null;
  const parsed = marketplaceScopeSchema.safeParse(value.trim().toLowerCase());
  return parsed.success ? parsed.data : null;
}

export function canonicalMarketplaceSearch(
  search: MarketplaceRouteSearch,
): MarketplaceRouteSearch | null {
  const base = canonicalPoolRedirectSearch(search);
  const parsed = parseMarketplaceScope(search.scope);
  const canonicalScope = parsed ?? undefined;
  const validScalar =
    search.scope === undefined ||
    search.scope === "all" ||
    (typeof search.scope === "string" &&
      marketplaceScopeSchema.safeParse(search.scope.trim().toLowerCase()).success);
  const changedScope = !validScalar || search.scope !== canonicalScope;
  const hasPoolOnlyFilters =
    (canonicalScope !== "pools" && search.out_voucher !== undefined) ||
    search.vouchers !== undefined ||
    search.voucherMatch !== undefined;
  if (!base && !changedScope && !hasPoolOnlyFilters) return null;
  return {
    ...(base ?? search),
    scope: canonicalScope,
    out_voucher: canonicalScope === "pools" ? (base ?? search).out_voucher : undefined,
    vouchers: undefined,
    voucherMatch: undefined,
  };
}

export function marketplaceSearchForScope(
  search: MarketplaceRouteSearch,
  scope: MarketplaceScope | null,
): MarketplaceRouteSearch {
  return {
    ...search,
    scope: scope ?? undefined,
    out_voucher: scope === "pools" ? search.out_voucher : undefined,
    vouchers: undefined,
    voucherMatch: undefined,
  };
}

/** The unfiltered All view is the destination owned by the round Market navigation action. */
export function isAtMarketplaceRoot(search: unknown): boolean {
  const state = pickMarketplaceSearch(search);
  return (
    state.scope === undefined &&
    state.q === undefined &&
    state.tags === undefined &&
    state.tagMatch === undefined &&
    state.vouchers === undefined &&
    state.voucherMatch === undefined &&
    state.out_voucher === undefined &&
    state.creditable === undefined
  );
}
