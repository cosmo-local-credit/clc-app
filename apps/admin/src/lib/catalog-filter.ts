import { type CatalogFilter, parseCatalogFilter } from "@clc/core/features/catalog/logic";

const NO_FILTER: CatalogFilter = {
  term: "",
  tags: [],
  tagMatch: "any",
  vouchers: [],
  voucherMatch: "any",
};

/**
 * A filter with relationships, for the tables that have them.
 *
 * `termFilter` covers the term-only screens. The post moderation queue also
 * filters by tag and by linked voucher, and both cross the wire in the catalog's
 * own comma-separated syntax, so the same parser that validates the term
 * validates those too. A malformed reference falls back to no filter rather than
 * throwing: the table still renders, unfiltered, which is what a hand-edited URL
 * should degrade to.
 */
export function relationshipFilter(state: {
  q?: string;
  tags?: string;
  vouchers?: string;
}): CatalogFilter {
  const parsed = parseCatalogFilter({
    q: state.q ?? "",
    ...(state.tags ? { tags: state.tags } : {}),
    ...(state.vouchers ? { vouchers: state.vouchers } : {}),
  });
  return parsed.ok ? parsed.filter : NO_FILTER;
}

/**
 * The catalog filter a console table sends: a server-side term and nothing else.
 *
 * `/api/v2/vouchers` and `/api/v2/pools` take one filter object covering tags and
 * voucher relationships as well as the term. The console's list screens filter by
 * term only, so the other fields are always empty.
 *
 * The term goes through `parseCatalogFilter` rather than being passed straight in,
 * because clc-core validates it and answers 400 for a term it will not accept:
 * `store.NewCatalogFilter` returns `ErrCatalogTermTooShort` under two characters
 * and `ErrCatalogTermTooLong` over 64, and the handlers turn both into a
 * validation error rather than an unfiltered list. `normalizeTerm` in @clc/core
 * encodes exactly those bounds — under the minimum the term becomes empty, over
 * the maximum it is truncated — so routing through it means a half-typed term
 * shows the unfiltered table instead of an error block. This is the same path
 * apps/web's catalog search takes.
 *
 * An empty term is normal, not a disabled state: the clients omit `q` for it, so
 * an unsearched table issues the same request it would have without a filter.
 */
export function termFilter(term: unknown): CatalogFilter {
  // A hand-written URL such as `?q=0` is deserialized as a number by the
  // router's default parser. It is not a valid free-text term, and passing it
  // through would call `.trim()` on a number inside the shared normalizer.
  const parsed = parseCatalogFilter({ q: typeof term === "string" ? term : "" });
  // Every failure variant concerns tags or voucher references, of which a
  // term-only state has none, so this cannot currently fail. Falling back to no
  // filter rather than throwing keeps the table rendering if that changes.
  return parsed.ok ? parsed.filter : NO_FILTER;
}
