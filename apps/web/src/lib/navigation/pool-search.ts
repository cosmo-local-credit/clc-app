import type { CatalogRouteSearch } from "#/lib/navigation/catalog-search";
import { canonicalRedirectSearch, pickCatalogSearch } from "#/lib/navigation/catalog-search";
import { isAddress } from "viem";

export type PoolRouteSearch = CatalogRouteSearch & {
  out_voucher?: string | readonly string[];
  /** The Credit filter: `1` while on, absent while off. Any other value reads as off. */
  credit?: unknown;
  /** A legacy Credit link's depth: `1`, `2`, `3` or `max` read as on. */
  creditDepth?: unknown;
  /** The legacy boolean Credit link: `true` reads as on. */
  creditable?: unknown;
};

export type PoolOutputVoucherResult = { ok: true; address: `0x${string}` | null } | { ok: false };

type CreditSearch = Pick<PoolRouteSearch, "credit" | "creditDepth" | "creditable">;

/** The depths an older Credit link could name; each now reads as Credit on. */
const LEGACY_CREDIT_DEPTHS: ReadonlySet<string> = new Set(["1", "2", "3", "max"]);

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

  // Kept as written: `canonicalCreditSearch` decides what each Credit value means.
  for (const key of ["credit", "creditDepth", "creditable"] as const) {
    if (record[key] !== undefined) next[key] = record[key];
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

/** One URL value as trimmed lower-case text; a repeated or structured value matches nothing. */
function searchScalar(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value).trim().toLowerCase()
    : "";
}

/**
 * Whether a URL turns Credit on: `credit=1`, or an older link's `creditDepth`
 * (`1`, `2`, `3` or `max`) or `creditable=true`. `credit` decides when it is
 * present; every other value, malformed or repeated, reads as off.
 */
export function parseCredit(search: CreditSearch): boolean {
  if (search.credit !== undefined) return searchScalar(search.credit) === "1";
  if (search.creditDepth !== undefined) {
    return LEGACY_CREDIT_DEPTHS.has(searchScalar(search.creditDepth));
  }
  return searchScalar(search.creditable) === "true";
}

/**
 * The search update that turns Credit on or off. It always drops the legacy
 * keys, so an old link cannot resurrect a state the person changed.
 */
export function withCredit(on: boolean): {
  credit: 1 | undefined;
  creditDepth: undefined;
  creditable: undefined;
} {
  return { credit: on ? 1 : undefined, creditDepth: undefined, creditable: undefined };
}

/**
 * The canonical Credit search for a URL, or null when it already is one:
 * `credit=1` while on and nothing while off, with any legacy key folded in.
 */
export function canonicalCreditSearch(search: CreditSearch): ReturnType<typeof withCredit> | null {
  const canonical =
    (search.credit === undefined || search.credit === 1) &&
    search.creditDepth === undefined &&
    search.creditable === undefined;
  return canonical ? null : withCredit(parseCredit(search));
}

/** Canonicalize catalog filters and the pool-only URL state in one replace redirect. */
export function canonicalPoolRedirectSearch(search: PoolRouteSearch): PoolRouteSearch | null {
  const catalogNext = canonicalRedirectSearch(search, { voucherRelationships: true });
  const output = parsePoolOutputVoucher(search.out_voucher);
  const credit = canonicalCreditSearch(search);
  let next = catalogNext ?? search;
  let changed = catalogNext !== null;

  if (output.ok) {
    const canonical = output.address ?? undefined;
    if (search.out_voucher !== canonical) {
      next = { ...next, out_voucher: canonical };
      changed = true;
    }
  }

  if (credit) {
    next = { ...next, ...credit };
    changed = true;
  }

  return changed ? next : null;
}
