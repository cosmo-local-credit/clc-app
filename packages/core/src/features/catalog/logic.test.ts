import { describe, expect, it } from "vite-plus/test";

import {
  CATALOG_MAX_TAGS,
  CATALOG_MAX_VOUCHERS,
  CATALOG_TERM_MAX,
  type CatalogFilter,
  isFilterActive,
  isFilterSearchActive,
  parseCatalogFilter,
  parseCatalogSearchState,
  toCatalogSearchState,
} from "./logic";

function mustParse(state: Parameters<typeof parseCatalogFilter>[0]): CatalogFilter {
  const result = parseCatalogFilter(state);
  if (!result.ok) throw new Error(`expected a valid filter, got ${result.reason}`);
  return result.filter;
}

const ASTRAL = "😀";
const FIRST_VOUCHER = "42220:0x1111111111111111111111111111111111111111";
const SECOND_VOUCHER = "42220:0x2222222222222222222222222222222222222222";

function catalogFilter(
  value: Omit<CatalogFilter, "vouchers" | "voucherMatch"> &
    Partial<Pick<CatalogFilter, "vouchers" | "voucherMatch">>,
): CatalogFilter {
  return { vouchers: [], voucherMatch: "any", ...value };
}

describe("term normalization", () => {
  it("collapses every kind of internal whitespace", () => {
    expect(mustParse({ q: "  sarafu \t\n  network " }).term).toBe("sarafu network");
    expect(mustParse({ q: "sarafu network" }).term).toBe("sarafu network");
  });

  it("treats equivalent spellings as one filter, so they share one cache key", () => {
    expect(mustParse({ q: "  sarafu   network " })).toEqual(mustParse({ q: "sarafu network" }));
  });

  it("counts code points, not UTF-16 units", () => {
    const term = ASTRAL.repeat(CATALOG_TERM_MAX);
    expect(term.length).toBe(CATALOG_TERM_MAX * 2);
    expect(mustParse({ q: term }).term).toBe(term);
  });

  it("clamps an overlong term in code points, not in UTF-16 units", () => {
    const clamped = mustParse({ q: ASTRAL.repeat(100) }).term;
    expect(Array.from(clamped)).toHaveLength(CATALOG_TERM_MAX);
    expect(clamped).toBe(ASTRAL.repeat(CATALOG_TERM_MAX));
  });

  it("collapses before counting, so padding cannot destroy a valid search", () => {
    expect(mustParse({ q: `${" ".repeat(64)}art` }).term).toBe("art");
  });

  it("drops a term below the minimum instead of sending one the server rejects", () => {
    expect(mustParse({ q: "a" }).term).toBe("");
    expect(mustParse({ q: "  a  " }).term).toBe("");
    expect(mustParse({ q: "ar" }).term).toBe("ar");
  });

  it("reads a whitespace-only term as no filter at all", () => {
    expect(isFilterActive(mustParse({ q: "   " }))).toBe(false);
    expect(isFilterSearchActive({ q: "   " })).toBe(false);
  });

  it("keeps LIKE metacharacters, which the server escapes", () => {
    expect(mustParse({ q: "50% Off" }).term).toBe("50% Off");
    expect(mustParse({ q: "a_b" }).term).toBe("a_b");
  });
});

describe("tag normalization", () => {
  it("deduplicates and sorts, so equivalent selections share one cache key", () => {
    expect(mustParse({ tags: "Mobility,Art" }).tags).toEqual(["Art", "Mobility"]);
    expect(mustParse({ tags: ["Art", "Mobility"] }).tags).toEqual(["Art", "Mobility"]);
    expect(mustParse({ tags: "Art,Art,Mobility" }).tags).toEqual(["Art", "Mobility"]);
  });

  it("keeps multi-word values intact and drops blanks", () => {
    expect(mustParse({ tags: "Food production,,Common Spaces" }).tags).toEqual([
      "Common Spaces",
      "Food production",
    ]);
  });

  it("never case-folds, because the server compares tag values exactly", () => {
    expect(mustParse({ tags: "art" }).tags).toEqual(["art"]);
  });

  it("reports more than the maximum instead of dropping the excess", () => {
    const tags = Array.from({ length: CATALOG_MAX_TAGS + 1 }, (_, index) => `Tag${index}`);
    const result = parseCatalogFilter({ tags });

    expect(result).toEqual({
      ok: false,
      reason: "too-many-tags",
      requested: CATALOG_MAX_TAGS + 1,
      max: CATALOG_MAX_TAGS,
    });
  });

  it("accepts exactly the maximum", () => {
    const tags = Array.from({ length: CATALOG_MAX_TAGS }, (_, index) => `Tag${index}`);
    expect(mustParse({ tags }).tags).toHaveLength(CATALOG_MAX_TAGS);
  });

  it("counts duplicates once against the maximum", () => {
    const tags = [...Array.from({ length: CATALOG_MAX_TAGS }, (_, i) => `Tag${i}`), "Tag0"];
    expect(mustParse({ tags }).tags).toHaveLength(CATALOG_MAX_TAGS);
  });
});

describe("tagMatch canonicalization", () => {
  it("drops `all` below two tags, where the two modes are one predicate", () => {
    expect(mustParse({ tags: "Art", tagMatch: "all" }).tagMatch).toBe("any");
    expect(mustParse({ tagMatch: "all" }).tagMatch).toBe("any");
    expect(mustParse({ tags: "Art,Mobility", tagMatch: "all" }).tagMatch).toBe("all");
  });

  it("makes a one-tag `all` URL share a cache key with the plain one", () => {
    expect(mustParse({ tags: "Art", tagMatch: "all" })).toEqual(mustParse({ tags: "Art" }));
    expect(toCatalogSearchState(mustParse({ tags: "Art", tagMatch: "all" }))).toEqual({
      tags: "Art",
    });
  });
});

describe("voucher relationship normalization", () => {
  it("deduplicates, sorts, and case-folds stable chain/address references", () => {
    expect(
      mustParse({
        vouchers: [
          `${SECOND_VOUCHER.toUpperCase().replace("0X", "0x")}`,
          FIRST_VOUCHER,
          FIRST_VOUCHER,
        ],
      }).vouchers,
    ).toEqual([
      { chainId: 42220, address: "0x1111111111111111111111111111111111111111" },
      { chainId: 42220, address: "0x2222222222222222222222222222222222222222" },
    ]);
  });

  it("rejects malformed references instead of silently broadening the filter", () => {
    expect(parseCatalogFilter({ vouchers: "42220:not-an-address" })).toEqual({
      ok: false,
      reason: "invalid-vouchers",
    });
    expect(
      parseCatalogFilter({ vouchers: "0:0x1111111111111111111111111111111111111111" }).ok,
    ).toBe(false);
  });

  it("reports more than the maximum after deduplication", () => {
    const vouchers = Array.from(
      { length: CATALOG_MAX_VOUCHERS + 1 },
      (_, index) => `42220:0x${String(index + 1).padStart(40, "0")}`,
    );
    expect(parseCatalogFilter({ vouchers })).toEqual({
      ok: false,
      reason: "too-many-vouchers",
      requested: CATALOG_MAX_VOUCHERS + 1,
      max: CATALOG_MAX_VOUCHERS,
    });
  });

  it("canonicalizes any/all independently from tag matching", () => {
    expect(mustParse({ vouchers: FIRST_VOUCHER, voucherMatch: "all" }).voucherMatch).toBe("any");
    expect(
      mustParse({ vouchers: `${FIRST_VOUCHER},${SECOND_VOUCHER}`, voucherMatch: "all" })
        .voucherMatch,
    ).toBe("all");
  });
});

describe("search-state parsing", () => {
  it("accepts the repeated-key array the router produces", () => {
    expect(parseCatalogSearchState({ tags: ["Art", "Mobility"] })).toEqual({
      tags: ["Art", "Mobility"],
    });
    expect(mustParse(parseCatalogSearchState({ tags: ["Art", "Mobility"] })).tags).toEqual([
      "Art",
      "Mobility",
    ]);
  });

  it("accepts repetition and comma-joining in the same request", () => {
    const state = parseCatalogSearchState({ tags: ["Art,Culture", "Mobility"] });
    expect(mustParse(state).tags).toEqual(["Art", "Culture", "Mobility"]);
  });

  it("keeps values the router coerced to numbers", () => {
    expect(parseCatalogSearchState({ q: 2024 })).toEqual({ q: "2024" });
    expect(mustParse({ q: parseCatalogSearchState({ q: 2024 }).q }).term).toBe("2024");
    expect(mustParse(parseCatalogSearchState({ tags: [1, "Art"] })).tags).toEqual(["1", "Art"]);
  });

  it("keeps values the router coerced to booleans", () => {
    expect(parseCatalogSearchState({ q: true })).toEqual({ q: "true" });
  });

  it("accepts tagMatch case-insensitively and rejects anything else", () => {
    expect(parseCatalogSearchState({ tagMatch: "ALL" }).tagMatch).toBe("all");
    expect(parseCatalogSearchState({ tagMatch: " Any " }).tagMatch).toBe("any");
    expect(parseCatalogSearchState({ tagMatch: "either" }).tagMatch).toBeUndefined();
  });

  it("ignores absent, null, and non-scalar values", () => {
    expect(parseCatalogSearchState({})).toEqual({});
    expect(parseCatalogSearchState({ q: null, tags: null })).toEqual({});
    expect(parseCatalogSearchState({ q: { nested: true } })).toEqual({});
    expect(parseCatalogSearchState(undefined)).toEqual({});
    expect(parseCatalogSearchState("nonsense")).toEqual({});
  });

  it("passes non-filter keys through untouched by omitting them", () => {
    expect(parseCatalogSearchState({ tab: "market", view: "list", q: "art" })).toEqual({
      q: "art",
    });
  });
});

describe("serialization", () => {
  it("omits keys rather than writing empty ones", () => {
    expect(toCatalogSearchState(catalogFilter({ term: "", tags: [], tagMatch: "any" }))).toEqual(
      {},
    );
  });

  it("comma-joins tags rather than repeating the key", () => {
    expect(
      toCatalogSearchState(
        catalogFilter({ term: "art", tags: ["Art", "Mobility"], tagMatch: "all" }),
      ),
    ).toEqual({ q: "art", tags: "Art,Mobility", tagMatch: "all" });
  });

  it("round-trips every valid filter to itself", () => {
    const cases: Array<Parameters<typeof parseCatalogFilter>[0]> = [
      {},
      { q: "art" },
      { tags: "Art" },
      { tags: "Mobility,Art" },
      { tags: ["Art", "Mobility"], tagMatch: "all" },
      { q: "  sarafu   network ", tags: "Food production,Art", tagMatch: "all" },
      { q: "a" },
      { tags: "Art", tagMatch: "all" },
      { q: ASTRAL.repeat(100) },
      { vouchers: FIRST_VOUCHER },
      { vouchers: `${SECOND_VOUCHER},${FIRST_VOUCHER}`, voucherMatch: "all" },
      { q: "art", tags: "Art", vouchers: FIRST_VOUCHER },
    ];

    for (const input of cases) {
      const filter = mustParse(input);
      expect(mustParse(toCatalogSearchState(filter))).toEqual(filter);
    }
  });
});

describe("activity predicates", () => {
  it("distinguishes empty, term-only, tags-only, and both", () => {
    expect(isFilterActive(catalogFilter({ term: "", tags: [], tagMatch: "any" }))).toBe(false);
    expect(isFilterActive(catalogFilter({ term: "art", tags: [], tagMatch: "any" }))).toBe(true);
    expect(isFilterActive(catalogFilter({ term: "", tags: ["Art"], tagMatch: "any" }))).toBe(true);
    expect(isFilterActive(catalogFilter({ term: "art", tags: ["Art"], tagMatch: "any" }))).toBe(
      true,
    );
    expect(
      isFilterActive(
        catalogFilter({
          term: "",
          tags: [],
          tagMatch: "any",
          vouchers: [{ chainId: 42220, address: "0x1111111111111111111111111111111111111111" }],
        }),
      ),
    ).toBe(true);
  });

  it("reports an over-limit state as filtered, where parseCatalogFilter reports failure", () => {
    const tags = Array.from({ length: CATALOG_MAX_TAGS + 1 }, (_, index) => `Tag${index}`);

    expect(parseCatalogFilter({ tags }).ok).toBe(false);
    expect(isFilterSearchActive({ tags })).toBe(true);
  });

  it("gives every unfiltered filter its own tags array", () => {
    const first = mustParse({});
    const second = mustParse({ q: "art" });
    expect(first.tags).not.toBe(second.tags);
    expect(first.tags).not.toBe(mustParse({}).tags);
  });

  it("reads an unfiltered search state as unfiltered", () => {
    expect(isFilterSearchActive({})).toBe(false);
    expect(isFilterSearchActive({ tagMatch: "all" })).toBe(false);
    expect(isFilterSearchActive({ q: "a" })).toBe(false);
    expect(isFilterSearchActive({ q: "art" })).toBe(true);
  });
});
