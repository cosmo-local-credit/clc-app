export type TagMatch = "any" | "all";

export type HexAddress = `0x${string}`;

export type VoucherRef = {
  chainId: number;
  address: HexAddress;
};

export type CatalogSearchState = {
  q?: string;
  tags?: string | readonly string[];
  tagMatch?: TagMatch;
  vouchers?: string | readonly string[];
  voucherMatch?: TagMatch;
};

export type CatalogFilter = {
  term: string;
  tags: readonly string[];
  tagMatch: TagMatch;
  vouchers: readonly VoucherRef[];
  voucherMatch: TagMatch;
};

export type CatalogFilterResult =
  | { ok: true; filter: CatalogFilter }
  | { ok: false; reason: "too-many-tags"; requested: number; max: number }
  | { ok: false; reason: "too-many-vouchers"; requested: number; max: number }
  | { ok: false; reason: "invalid-vouchers" };

const CATALOG_TERM_MIN = 2;

export const CATALOG_TERM_MAX = 64;

export const CATALOG_MAX_TAGS = 12;

/**
 * Frontend-only gate. The backend paginates and imposes no such cap; this keeps a single filter
 * request from fanning out across too many voucher relationships while load is still being tuned.
 */
export const CATALOG_MAX_VOUCHERS = 10;

export function parseCatalogSearchState(search: unknown): CatalogSearchState {
  if (typeof search !== "object" || search === null) return {};
  const source = search as Record<string, unknown>;

  const state: CatalogSearchState = {};

  const q = coerceScalar(source.q);
  if (q !== undefined) state.q = q;

  const tags = coerceList(source.tags);
  if (tags !== undefined) state.tags = tags;

  const tagMatch = coerceScalar(source.tagMatch)?.trim().toLowerCase();
  if (tagMatch === "any" || tagMatch === "all") state.tagMatch = tagMatch;

  const vouchers = coerceList(source.vouchers);
  if (vouchers !== undefined) state.vouchers = vouchers;

  const voucherMatch = coerceScalar(source.voucherMatch)?.trim().toLowerCase();
  if (voucherMatch === "any" || voucherMatch === "all") state.voucherMatch = voucherMatch;

  return state;
}

export function parseCatalogFilter(state: CatalogSearchState): CatalogFilterResult {
  const normalizedVouchers = normalizeVoucherRefs(state.vouchers);
  if (!normalizedVouchers.ok) return normalizedVouchers;

  const filter = normalizeCatalogFilter(state, normalizedVouchers.vouchers);

  if (filter.tags.length > CATALOG_MAX_TAGS) {
    return {
      ok: false,
      reason: "too-many-tags",
      requested: filter.tags.length,
      max: CATALOG_MAX_TAGS,
    };
  }

  if (filter.vouchers.length > CATALOG_MAX_VOUCHERS) {
    return {
      ok: false,
      reason: "too-many-vouchers",
      requested: filter.vouchers.length,
      max: CATALOG_MAX_VOUCHERS,
    };
  }

  return { ok: true, filter };
}

export function toCatalogSearchState(filter: CatalogFilter): CatalogSearchState {
  const state: CatalogSearchState = {};
  if (filter.term !== "") state.q = filter.term;
  if (filter.tags.length > 0) state.tags = filter.tags.join(",");
  if (filter.tags.length > 1 && filter.tagMatch === "all") state.tagMatch = "all";
  if (filter.vouchers.length > 0) {
    state.vouchers = filter.vouchers.map(serializeVoucherRef).join(",");
  }
  if (filter.vouchers.length > 1 && filter.voucherMatch === "all") {
    state.voucherMatch = "all";
  }
  return state;
}

export function isFilterActive(filter: CatalogFilter): boolean {
  return filter.term !== "" || filter.tags.length > 0 || filter.vouchers.length > 0;
}

export function isFilterSearchActive(state: CatalogSearchState): boolean {
  const result = parseCatalogFilter(state);
  return !result.ok || isFilterActive(result.filter);
}

function normalizeCatalogFilter(
  state: CatalogSearchState,
  vouchers: readonly VoucherRef[],
): CatalogFilter {
  const tags = normalizeTags(state.tags);
  return {
    term: normalizeTerm(state.q ?? ""),
    tags,
    tagMatch: tags.length > 1 && state.tagMatch === "all" ? "all" : "any",
    vouchers,
    voucherMatch: vouchers.length > 1 && state.voucherMatch === "all" ? "all" : "any",
  };
}

function normalizeTerm(raw: string): string {
  const collapsed = raw.trim().split(/\s+/).filter(Boolean).join(" ");
  const points = Array.from(collapsed);

  if (points.length < CATALOG_TERM_MIN) return "";
  if (points.length <= CATALOG_TERM_MAX) return collapsed;
  return points.slice(0, CATALOG_TERM_MAX).join("");
}

function normalizeTags(raw: string | readonly string[] | undefined): readonly string[] {
  if (raw === undefined) return [];

  const entries = typeof raw === "string" ? [raw] : raw;
  const seen = new Set<string>();
  for (const entry of entries) {
    for (const value of entry.split(",")) {
      const trimmed = value.trim();
      if (trimmed !== "") seen.add(trimmed);
    }
  }

  return [...seen].sort();
}

function coerceScalar(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : undefined;
  if (typeof value === "boolean") return String(value);
  return undefined;
}

function coerceList(value: unknown): string | readonly string[] | undefined {
  if (Array.isArray(value)) {
    const entries = value.map(coerceScalar).filter((entry): entry is string => entry !== undefined);
    return entries.length > 0 ? entries : undefined;
  }
  return coerceScalar(value);
}

function normalizeVoucherRefs(
  raw: string | readonly string[] | undefined,
): { ok: true; vouchers: readonly VoucherRef[] } | { ok: false; reason: "invalid-vouchers" } {
  if (raw === undefined) return { ok: true, vouchers: [] };

  const entries = typeof raw === "string" ? [raw] : raw;
  const vouchers = new Map<string, VoucherRef>();
  for (const entry of entries) {
    for (const value of entry.split(",")) {
      const trimmed = value.trim();
      if (trimmed === "") continue;

      const separator = trimmed.indexOf(":");
      const chainText = separator < 0 ? "" : trimmed.slice(0, separator).trim();
      const address =
        separator < 0
          ? ""
          : trimmed
              .slice(separator + 1)
              .trim()
              .toLowerCase();
      const chainId = Number(chainText);
      if (!Number.isSafeInteger(chainId) || chainId <= 0 || !/^0x[0-9a-f]{40}$/.test(address)) {
        return { ok: false, reason: "invalid-vouchers" };
      }

      const voucher: VoucherRef = { chainId, address: address as HexAddress };
      vouchers.set(serializeVoucherRef(voucher), voucher);
    }
  }

  return {
    ok: true,
    vouchers: [...vouchers.values()].sort(
      (left, right) => left.chainId - right.chainId || left.address.localeCompare(right.address),
    ),
  };
}

export function serializeVoucherRef(voucher: VoucherRef): string {
  return `${voucher.chainId}:${voucher.address.toLowerCase()}`;
}

export function formatVoucherAddress(address: HexAddress): string {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}
