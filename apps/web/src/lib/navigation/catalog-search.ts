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
};

export function pickCatalogSearch(search: unknown): CatalogSearchState {
  return parseCatalogSearchState(search);
}

export function canonicalCatalogSearch(search: unknown): CatalogSearchState | null {
  const state = pickCatalogSearch(search);
  const result = parseCatalogFilter(state);
  if (!result.ok) return null;

  const canonical = toCatalogSearchState(result.filter);
  return isSameCatalogSearch(state, canonical) ? null : canonical;
}

export function canonicalRedirectSearch<S extends CatalogRouteSearch>(search: S): S | null {
  const canonical = canonicalCatalogSearch(search);
  if (!canonical) return null;

  return { ...search, ...CLEARED_CATALOG_SEARCH, ...canonical } as S;
}

function isSameCatalogSearch(incoming: CatalogSearchState, canonical: CatalogSearchState): boolean {
  if (incoming.q !== canonical.q) return false;
  if (incoming.tagMatch !== canonical.tagMatch) return false;
  if (incoming.tags !== undefined && typeof incoming.tags !== "string") return false;
  return incoming.tags === serializeTags(canonical.tags);
}

function serializeTags(tags: string | readonly string[] | undefined): string | undefined {
  if (tags === undefined) return undefined;
  return typeof tags === "string" ? tags : tags.join(",");
}
