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

/** The lists the market's badges open: one per resource, and All of them mixed. */
export type MarketListScope = MarketplaceScope | "all";

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
): MarketListScope | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "all") return "all";
  const parsed = marketplaceScopeSchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
}

export function canonicalMarketplaceSearch(
  search: MarketplaceRouteSearch,
): MarketplaceRouteSearch | null {
  const base = canonicalPoolRedirectSearch(search);
  const canonicalScope = parseMarketplaceScope(search.scope) ?? undefined;
  const changedScope = search.scope !== canonicalScope;
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
  scope: MarketListScope | null,
): MarketplaceRouteSearch {
  return {
    ...search,
    scope: scope ?? undefined,
    out_voucher: scope === "pools" ? search.out_voucher : undefined,
    vouchers: undefined,
    voucherMatch: undefined,
  };
}

/**
 * The map's share of a list's search: the query, the tags and Credit carry
 * between the map and every list, and nothing that belongs to one list does.
 */
export function mapSearchFrom(search: unknown): MarketplaceRouteSearch {
  const state = pickMarketplaceSearch(search);
  return {
    q: state.q,
    tags: state.tags,
    tagMatch: state.tagMatch,
    creditable: state.creditable,
  };
}
