import type { CatalogRouteSearch } from "#/lib/navigation/catalog-search";
import { canonicalRedirectSearch, pickCatalogSearch } from "#/lib/navigation/catalog-search";
import { parsePoolCreditable } from "#/lib/navigation/pool-search";

export type CreditableBrowseSearch = CatalogRouteSearch & {
  creditable?: boolean | string | readonly (boolean | string)[];
};

export function pickCreditableBrowseSearch(search: unknown): CreditableBrowseSearch {
  const catalog = pickCatalogSearch(search);
  if (typeof search !== "object" || search === null) return catalog;
  const value = (search as Record<string, unknown>).creditable;
  if (typeof value === "boolean" || typeof value === "string") {
    return { ...catalog, creditable: value };
  }
  if (Array.isArray(value) && value.length > 0) {
    return {
      ...catalog,
      creditable: value.every(
        (entry): entry is boolean | string =>
          typeof entry === "boolean" || typeof entry === "string",
      )
        ? value
        : ["__invalid__"],
    };
  }
  return value === undefined ? catalog : { ...catalog, creditable: ["__invalid__"] };
}

export function canonicalCreditableBrowseSearch(
  search: CreditableBrowseSearch,
): CreditableBrowseSearch | null {
  const catalog = canonicalRedirectSearch(search, { voucherRelationships: false });
  const parsed = parsePoolCreditable(search.creditable);
  if (!parsed.ok) return catalog;
  const canonical = parsed.enabled ?? undefined;
  if (catalog === null && search.creditable === canonical) return null;
  return { ...(catalog ?? search), creditable: canonical };
}
