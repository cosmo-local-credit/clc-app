import type { CatalogRouteSearch } from "#/lib/navigation/catalog-search";
import { canonicalRedirectSearch, pickCatalogSearch } from "#/lib/navigation/catalog-search";
import { isAddress } from "viem";

export type PoolRouteSearch = CatalogRouteSearch & {
  out_voucher?: string | readonly string[];
  creditable?: boolean | string | readonly (boolean | string)[];
};

export type PoolOutputVoucherResult = { ok: true; address: `0x${string}` | null } | { ok: false };
export type PoolCreditableResult = { ok: true; enabled: boolean | null } | { ok: false };

/** Pick the pool catalog's URL-owned search state without accepting unrelated keys. */
export function pickPoolSearch(search: unknown): PoolRouteSearch {
  const catalog = pickCatalogSearch(search);
  if (typeof search !== "object" || search === null) return catalog;

  const record = search as Record<string, unknown>;
  const next: PoolRouteSearch = { ...catalog };
  const outputVoucher = record.out_voucher;
  if (typeof outputVoucher === "string") {
    next.out_voucher = outputVoucher;
  } else if (Array.isArray(outputVoucher)) {
    if (outputVoucher.length > 0) {
      next.out_voucher = outputVoucher.every((entry): entry is string => typeof entry === "string")
        ? outputVoucher
        : ["__invalid__"];
    }
  } else if (outputVoucher !== undefined) {
    next.out_voucher = ["__invalid__"];
  }

  const creditable = record.creditable;
  if (typeof creditable === "boolean" || typeof creditable === "string") {
    next.creditable = creditable;
  } else if (Array.isArray(creditable)) {
    if (creditable.length > 0) {
      next.creditable = creditable.every(
        (entry): entry is boolean | string =>
          typeof entry === "boolean" || typeof entry === "string",
      )
        ? creditable
        : ["__invalid__"];
    }
  } else if (creditable !== undefined) {
    next.creditable = ["__invalid__"];
  }
  return next;
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

/** An optional explicit Credit choice; absence leaves Credit off. */
export function parsePoolCreditable(value: PoolRouteSearch["creditable"]): PoolCreditableResult {
  if (value === undefined) return { ok: true, enabled: null };
  if (typeof value === "boolean") return { ok: true, enabled: value };
  if (typeof value !== "string") return { ok: false };

  const normalized = value.trim().toLowerCase();
  if (normalized === "") return { ok: true, enabled: null };
  if (normalized === "true") return { ok: true, enabled: true };
  if (normalized === "false") return { ok: true, enabled: false };
  return { ok: false };
}

/** Canonicalize catalog filters and the pool-only URL state in one replace redirect. */
export function canonicalPoolRedirectSearch(search: PoolRouteSearch): PoolRouteSearch | null {
  const catalogNext = canonicalRedirectSearch(search, { voucherRelationships: true });
  const output = parsePoolOutputVoucher(search.out_voucher);
  const creditable = parsePoolCreditable(search.creditable);
  let next = catalogNext ?? search;
  let changed = catalogNext !== null;

  if (output.ok) {
    const canonical = output.address ?? undefined;
    if (search.out_voucher !== canonical) {
      next = { ...next, out_voucher: canonical };
      changed = true;
    }
  }

  if (creditable.ok) {
    const canonical = creditable.enabled ?? undefined;
    if (search.creditable !== canonical) {
      next = { ...next, creditable: canonical };
      changed = true;
    }
  }

  return changed ? next : null;
}
