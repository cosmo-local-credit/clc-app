import {
  type CatalogSearchState,
  parseCatalogFilter,
  parseCatalogSearchState,
  toCatalogSearchState,
} from "@clc/core/features/catalog/logic";

export type CatalogRouteSearch = CatalogSearchState;

export const CLEARED_CATALOG_SEARCH: Record<keyof CatalogRouteSearch, undefined> = {
  q: undefined,
  tags: undefined,
  tagMatch: undefined,
  vouchers: undefined,
  voucherMatch: undefined,
  pools: undefined,
  poolMatch: undefined,
};

export function pickCatalogSearch(search: unknown): CatalogSearchState {
  return parseCatalogSearchState(search);
}

export function catalogSearchForScope(
  search: unknown,
  voucherRelationships: boolean,
  poolRelationships = false,
): CatalogSearchState {
  const state = pickCatalogSearch(search);
  return {
    ...state,
    vouchers: voucherRelationships ? state.vouchers : undefined,
    voucherMatch: voucherRelationships ? state.voucherMatch : undefined,
    pools: poolRelationships ? state.pools : undefined,
    poolMatch: poolRelationships ? state.poolMatch : undefined,
  };
}

export function canonicalCatalogSearch(
  search: unknown,
  options: { voucherRelationships: boolean; poolRelationships?: boolean } = {
    voucherRelationships: true,
  },
): CatalogSearchState | null {
  const incoming = pickCatalogSearch(search);
  const state = catalogSearchForScope(
    incoming,
    options.voucherRelationships,
    options.poolRelationships,
  );
  const result = parseCatalogFilter(state);
  if (!result.ok) return null;

  const canonical = toCatalogSearchState(result.filter);
  const hasUnsupportedVoucherFilter =
    !options.voucherRelationships &&
    (incoming.vouchers !== undefined || incoming.voucherMatch !== undefined);
  const hasUnsupportedPoolFilter =
    !options.poolRelationships &&
    (incoming.pools !== undefined || incoming.poolMatch !== undefined);
  return !hasUnsupportedVoucherFilter &&
    !hasUnsupportedPoolFilter &&
    isSameCatalogSearch(state, canonical)
    ? null
    : canonical;
}

export function canonicalRedirectSearch<S extends CatalogRouteSearch>(
  search: S,
  options: { voucherRelationships: boolean; poolRelationships?: boolean } = {
    voucherRelationships: true,
  },
): S | null {
  const canonical = canonicalCatalogSearch(search, options);
  if (!canonical) return null;

  return { ...search, ...CLEARED_CATALOG_SEARCH, ...canonical } as S;
}

function isSameCatalogSearch(incoming: CatalogSearchState, canonical: CatalogSearchState): boolean {
  if (incoming.q !== canonical.q) return false;
  if (incoming.tagMatch !== canonical.tagMatch) return false;
  if (incoming.tags !== undefined && typeof incoming.tags !== "string") return false;
  if (incoming.tags !== serializeList(canonical.tags)) return false;
  if (incoming.voucherMatch !== canonical.voucherMatch) return false;
  if (incoming.vouchers !== undefined && typeof incoming.vouchers !== "string") return false;
  if (incoming.vouchers !== serializeList(canonical.vouchers)) return false;
  if (incoming.poolMatch !== canonical.poolMatch) return false;
  if (incoming.pools !== undefined && typeof incoming.pools !== "string") return false;
  return incoming.pools === serializeList(canonical.pools);
}

function serializeList(values: string | readonly string[] | undefined): string | undefined {
  if (values === undefined) return undefined;
  return typeof values === "string" ? values : values.join(",");
}
