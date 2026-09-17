import type { TagMatch, VoucherRef } from "@clc/core/features/catalog/logic";
import { parseCatalogFilter, serializeVoucherRef } from "@clc/core/features/catalog/logic";
import {
  readOwnerScoped,
  removeOwnerScoped,
  writeOwnerScoped,
} from "#/lib/storage/owner-scoped-storage";
import type { StorageOwner } from "#/lib/storage/owner-tier-key";

/**
 * Read-once bootstrap persistence for a catalog's remembered facet selection.
 *
 * The URL is the source of truth for an active visit; storage only seeds a
 * catalog that mounts without a filter, so an explicit or shared link always
 * wins. Nothing subscribes to the stored value — it is read at the
 * client-only/effect boundary and then forgotten.
 *
 * That makes this bootstrap state, not reactive cross-route state, so it does
 * not belong in Zustand: a store holding the facet selection would sit beside
 * the search params as a second source of truth for the same filter, which is
 * exactly the stale-UI trap the state rules warn about. Same shape as
 * `features/home/api/last-location-storage.ts` and
 * `features/wallet/api/address-book-storage.ts`.
 *
 * Only facet choices are remembered: restoring free text would make a later
 * visit look mysteriously empty.
 *
 * Scoped to an owner, including a `guest` tier — these are public screens, and a
 * visitor who has never signed in still gets their selection back. Previously a
 * single key per catalog, so one person's remembered facets silently narrowed
 * the next person's market: not a disclosure so much as a screen that looks
 * mysteriously empty for reasons the new user cannot see.
 *
 * The owner arrives as an argument rather than from a hook, so `lib/navigation/`
 * stays free of `features/` imports.
 */
export const CATALOG_FILTER_PREFERENCE_NAMES = {
  market: "market.filter-preferences.v1",
  pools: "pools.filter-preferences.v1",
  posts: "posts.filter-preferences.v1",
} as const;

export type CatalogFilterPreference = {
  tags: readonly string[];
  tagMatch: TagMatch;
  vouchers: readonly VoucherRef[];
  voucherMatch: TagMatch;
};

export function readCatalogFilterPreference(
  owner: StorageOwner,
  name: string,
): CatalogFilterPreference | null {
  const raw = readOwnerScoped(owner, name);
  if (!raw) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    clearCatalogFilterPreference(owner, name);
    return null;
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    clearCatalogFilterPreference(owner, name);
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const storedVouchers = candidate.vouchers ?? [];
  const storedVoucherMatch = candidate.voucherMatch ?? "any";
  if (
    !Array.isArray(candidate.tags) ||
    !candidate.tags.every((tag) => typeof tag === "string") ||
    (candidate.tagMatch !== "any" && candidate.tagMatch !== "all") ||
    !Array.isArray(storedVouchers) ||
    !storedVouchers.every((voucher) => typeof voucher === "string") ||
    (storedVoucherMatch !== "any" && storedVoucherMatch !== "all")
  ) {
    clearCatalogFilterPreference(owner, name);
    return null;
  }

  const result = parseCatalogFilter({
    tags: candidate.tags as string[],
    tagMatch: candidate.tagMatch,
    vouchers: storedVouchers as string[],
    voucherMatch: storedVoucherMatch,
  });
  if (!result.ok || (result.filter.tags.length === 0 && result.filter.vouchers.length === 0)) {
    clearCatalogFilterPreference(owner, name);
    return null;
  }

  return {
    tags: result.filter.tags,
    tagMatch: result.filter.tagMatch,
    vouchers: result.filter.vouchers,
    voucherMatch: result.filter.voucherMatch,
  };
}

export function writeCatalogFilterPreference(
  owner: StorageOwner,
  name: string,
  tags: readonly string[],
  tagMatch: TagMatch,
  vouchers: readonly VoucherRef[],
  voucherMatch: TagMatch,
): void {
  const result = parseCatalogFilter({
    tags,
    tagMatch,
    vouchers: vouchers.map(serializeVoucherRef),
    voucherMatch,
  });
  if (!result.ok || (result.filter.tags.length === 0 && result.filter.vouchers.length === 0)) {
    clearCatalogFilterPreference(owner, name);
    return;
  }

  // A blocked or full store must not stop filters from applying to the URL, so
  // this write is best-effort — see `lib/storage/local-storage.ts`.
  writeOwnerScoped(
    owner,
    name,
    JSON.stringify({
      tags: result.filter.tags,
      tagMatch: result.filter.tagMatch,
      vouchers: result.filter.vouchers.map(serializeVoucherRef),
      voucherMatch: result.filter.voucherMatch,
    }),
  );
}

export function clearCatalogFilterPreference(owner: StorageOwner, name: string): void {
  removeOwnerScoped(owner, name);
}
