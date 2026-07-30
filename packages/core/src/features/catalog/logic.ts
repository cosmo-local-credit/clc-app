export type TagMatch = "any" | "all";

export type CatalogSearchState = {
  q?: string;
  tags?: string | readonly string[];
  tagMatch?: TagMatch;
};

export type CatalogFilter = {
  term: string;
  tags: readonly string[];
  tagMatch: TagMatch;
};

export type CatalogFilterResult =
  | { ok: true; filter: CatalogFilter }
  | { ok: false; reason: "too-many-tags"; requested: number; max: number };

const CATALOG_TERM_MIN = 2;

export const CATALOG_TERM_MAX = 64;

export const CATALOG_MAX_TAGS = 12;

export function parseCatalogSearchState(search: unknown): CatalogSearchState {
  if (typeof search !== "object" || search === null) return {};
  const source = search as Record<string, unknown>;

  const state: CatalogSearchState = {};

  const q = coerceScalar(source.q);
  if (q !== undefined) state.q = q;

  const tags = coerceTags(source.tags);
  if (tags !== undefined) state.tags = tags;

  const tagMatch = coerceScalar(source.tagMatch)?.trim().toLowerCase();
  if (tagMatch === "any" || tagMatch === "all") state.tagMatch = tagMatch;

  return state;
}

export function parseCatalogFilter(state: CatalogSearchState): CatalogFilterResult {
  const filter = normalizeCatalogFilter(state);

  if (filter.tags.length > CATALOG_MAX_TAGS) {
    return {
      ok: false,
      reason: "too-many-tags",
      requested: filter.tags.length,
      max: CATALOG_MAX_TAGS,
    };
  }

  return { ok: true, filter };
}

export function toCatalogSearchState(filter: CatalogFilter): CatalogSearchState {
  const state: CatalogSearchState = {};
  if (filter.term !== "") state.q = filter.term;
  if (filter.tags.length > 0) state.tags = filter.tags.join(",");
  if (filter.tags.length > 1 && filter.tagMatch === "all") state.tagMatch = "all";
  return state;
}

export function isFilterActive(filter: CatalogFilter): boolean {
  return filter.term !== "" || filter.tags.length > 0;
}

export function isFilterSearchActive(state: CatalogSearchState): boolean {
  return isFilterActive(normalizeCatalogFilter(state));
}

function normalizeCatalogFilter(state: CatalogSearchState): CatalogFilter {
  const tags = normalizeTags(state.tags);
  return {
    term: normalizeTerm(state.q ?? ""),
    tags,
    tagMatch: tags.length > 1 && state.tagMatch === "all" ? "all" : "any",
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

function coerceTags(value: unknown): string | readonly string[] | undefined {
  if (Array.isArray(value)) {
    const entries = value.map(coerceScalar).filter((entry): entry is string => entry !== undefined);
    return entries.length > 0 ? entries : undefined;
  }
  return coerceScalar(value);
}
