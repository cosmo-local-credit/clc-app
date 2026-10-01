import type { CatalogRouteSearch } from "#/lib/navigation/catalog-search";
import { canonicalRedirectSearch, pickCatalogSearch } from "#/lib/navigation/catalog-search";
import { isAddress } from "viem";

export type PoolRouteSearch = CatalogRouteSearch & {
  out_voucher?: string | readonly string[];
};

export type PoolOutputVoucherResult = { ok: true; address: `0x${string}` | null } | { ok: false };

/** Pick the pool catalog's URL-owned search state without accepting unrelated keys. */
export function pickPoolSearch(search: unknown): PoolRouteSearch {
  const catalog = pickCatalogSearch(search);
  if (typeof search !== "object" || search === null) return catalog;

  const value = (search as Record<string, unknown>).out_voucher;
  if (typeof value === "string") return { ...catalog, out_voucher: value };
  if (Array.isArray(value)) {
    const entries = value.filter((entry): entry is string => typeof entry === "string");
    if (entries.length > 0) return { ...catalog, out_voucher: entries };
  }
  return catalog;
}

/** One optional current-chain voucher address; repeated values are deliberately invalid. */
export function parsePoolOutputVoucher(
  value: PoolRouteSearch["out_voucher"],
): PoolOutputVoucherResult {
  if (value === undefined) return { ok: true, address: null };
  if (typeof value !== "string") return { ok: false };

  const trimmed = value.trim();
  if (trimmed === "") return { ok: true, address: null };
  const normalizedPrefix = trimmed.startsWith("0X") ? `0x${trimmed.slice(2)}` : trimmed;
  // URL addresses are identifiers rather than user-authored checksummed values.
  // Accept uniformly mixed casing, then make the URL canonical ourselves.
  if (!isAddress(normalizedPrefix, { strict: false })) return { ok: false };
  return { ok: true, address: normalizedPrefix.toLowerCase() as `0x${string}` };
}

/** Canonicalize catalog filters and the pool-only output voucher in one replace redirect. */
export function canonicalPoolRedirectSearch(search: PoolRouteSearch): PoolRouteSearch | null {
  const catalogNext = canonicalRedirectSearch(search, { voucherRelationships: true });
  const output = parsePoolOutputVoucher(search.out_voucher);
  let next = catalogNext ?? search;
  let changed = catalogNext !== null;

  if (output.ok) {
    const canonical = output.address ?? undefined;
    if (search.out_voucher !== canonical) {
      next = { ...next, out_voucher: canonical };
      changed = true;
    }
  }

  return changed ? next : null;
}
