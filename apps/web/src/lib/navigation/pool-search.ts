import type { CatalogRouteSearch } from "#/lib/navigation/catalog-search";
import { canonicalRedirectSearch, pickCatalogSearch } from "#/lib/navigation/catalog-search";
import { isAddress } from "viem";

export type PoolRouteSearch = CatalogRouteSearch & {
  out_voucher?: string | readonly string[];
  /** The Credit filter's depth: 1 or 2 pool hops. Absent is off. */
  creditDepth?: number | string | readonly (number | string)[];
  /** The legacy boolean Credit link, normalized to `creditDepth` (on is depth 1). */
  creditable?: boolean | string | readonly (boolean | string)[];
};

/** How many pool hops the Credit filter reaches. Depth 2 includes depth 1. */
export type CreditDepthValue = 1 | 2;

export type PoolOutputVoucherResult = { ok: true; address: `0x${string}` | null } | { ok: false };
type PoolCreditableResult = { ok: true; enabled: boolean | null } | { ok: false };
export type PoolCreditResult = { ok: true; depth: CreditDepthValue | null } | { ok: false };

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

  const creditDepth = record.creditDepth;
  if (typeof creditDepth === "number" || typeof creditDepth === "string") {
    next.creditDepth = creditDepth;
  } else if (Array.isArray(creditDepth)) {
    if (creditDepth.length > 0) {
      next.creditDepth = creditDepth.every(
        (entry): entry is number | string => typeof entry === "number" || typeof entry === "string",
      )
        ? creditDepth
        : ["__invalid__"];
    }
  } else if (creditDepth !== undefined) {
    next.creditDepth = ["__invalid__"];
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

/** The legacy boolean Credit choice; absence leaves Credit off. */
function parsePoolCreditable(value: PoolRouteSearch["creditable"]): PoolCreditableResult {
  if (value === undefined) return { ok: true, enabled: null };
  if (typeof value === "boolean") return { ok: true, enabled: value };
  if (typeof value !== "string") return { ok: false };

  const normalized = value.trim().toLowerCase();
  if (normalized === "") return { ok: true, enabled: null };
  if (normalized === "true") return { ok: true, enabled: true };
  if (normalized === "false") return { ok: true, enabled: false };
  return { ok: false };
}

/** One explicit Credit depth, 1 or 2; repeated or other values are deliberately invalid. */
export function parseCreditDepth(value: PoolRouteSearch["creditDepth"]): PoolCreditResult {
  if (value === undefined) return { ok: true, depth: null };
  if (typeof value === "number") {
    return value === 1 || value === 2 ? { ok: true, depth: value } : { ok: false };
  }
  if (typeof value !== "string") return { ok: false };
  const trimmed = value.trim();
  if (trimmed === "") return { ok: true, depth: null };
  if (trimmed === "1") return { ok: true, depth: 1 };
  if (trimmed === "2") return { ok: true, depth: 2 };
  return { ok: false };
}

/**
 * The Credit state a URL names: its `creditDepth`, or a legacy `creditable`
 * link read as depth 1 (on) or off. A depth wins over the legacy flag.
 */
export function parsePoolCredit(
  search: Pick<PoolRouteSearch, "creditDepth" | "creditable">,
): PoolCreditResult {
  if (search.creditDepth !== undefined) return parseCreditDepth(search.creditDepth);
  const legacy = parsePoolCreditable(search.creditable);
  if (!legacy.ok) return { ok: false };
  return { ok: true, depth: legacy.enabled ? 1 : null };
}

/** What a malformed legacy Credit link becomes, so the screen can reject it. */
const INVALID_CREDIT_DEPTH = "invalid";

/** OFF, then one hop, then two hops, then OFF again: the Credit control's cycle. */
export function nextCreditDepth(current: CreditDepthValue | null): CreditDepthValue | undefined {
  if (current === null) return 1;
  if (current === 1) return 2;
  return undefined;
}

/**
 * The search update that sets Credit to `depth` (undefined is off). It always
 * drops the legacy flag, so an old link cannot resurrect a state the person changed.
 */
export function withCreditDepth(depth: CreditDepthValue | undefined): {
  creditDepth: CreditDepthValue | undefined;
  creditable: undefined;
} {
  return { creditDepth: depth, creditable: undefined };
}

/**
 * The canonical Credit search for a URL, or null when it already is: a valid
 * depth as a number, off as absent, a legacy `creditable` folded into it. An
 * invalid depth is left alone, and a malformed legacy flag becomes one, so the
 * screen can say so and offer to clear it.
 */
export function canonicalCreditSearch(
  search: Pick<PoolRouteSearch, "creditDepth" | "creditable">,
): {
  creditDepth: CreditDepthValue | typeof INVALID_CREDIT_DEPTH | undefined;
  creditable: undefined;
} | null {
  const credit = parsePoolCredit(search);
  if (!credit.ok) {
    // A malformed legacy flag still blocks results rather than broadening them:
    // it becomes an invalid depth the screen rejects and offers to clear.
    return search.creditDepth === undefined
      ? { creditDepth: INVALID_CREDIT_DEPTH, creditable: undefined }
      : null;
  }
  const canonical = credit.depth ?? undefined;
  if (search.creditDepth === canonical && search.creditable === undefined) return null;
  return withCreditDepth(canonical);
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
