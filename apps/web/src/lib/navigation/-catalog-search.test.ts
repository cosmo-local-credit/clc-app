import { CATALOG_MAX_TAGS, CATALOG_MAX_VOUCHERS } from "@clc/core/features/catalog/logic";
import { describe, expect, it } from "vite-plus/test";

import {
  canonicalCatalogSearch,
  canonicalRedirectSearch,
  pickCatalogSearch,
} from "./catalog-search";

type HomeSearch = {
  tab?: string;
  view?: string;
  q?: string;
  tags?: string | readonly string[];
  tagMatch?: "any" | "all";
  vouchers?: string | readonly string[];
  voucherMatch?: "any" | "all";
};

function validated(raw: Partial<HomeSearch>): HomeSearch {
  return {
    tab: raw.tab ?? "market",
    view: raw.view ?? "map",
    ...pickCatalogSearch(raw),
  };
}

describe("picking the filter slice", () => {
  it("takes only the filter keys, never the rest of the search object", () => {
    expect(pickCatalogSearch({ tab: "market", view: "list", q: "art", other: 1 })).toEqual({
      q: "art",
    });
  });
});

describe("canonical filter detection", () => {
  it("leaves a canonical filter alone", () => {
    expect(canonicalCatalogSearch({ q: "art" })).toBeNull();
    expect(canonicalCatalogSearch({ tags: "Art,Mobility" })).toBeNull();
    expect(canonicalCatalogSearch({ tags: "Art,Mobility", tagMatch: "all" })).toBeNull();
    expect(canonicalCatalogSearch({})).toBeNull();
  });

  it("ignores the coerced keys entirely, so a plain visit never redirects", () => {
    expect(canonicalCatalogSearch(validated({}))).toBeNull();
    expect(canonicalCatalogSearch(validated({ view: "list" }))).toBeNull();
    expect(canonicalCatalogSearch(validated({ tab: "wallet" }))).toBeNull();
  });

  it("normalizes a padded term", () => {
    expect(canonicalCatalogSearch({ q: "  art " })).toEqual({ q: "art" });
  });

  it("sorts and comma-joins a repeated tag key", () => {
    expect(canonicalCatalogSearch({ tags: ["Mobility", "Art"] })).toEqual({ tags: "Art,Mobility" });
  });

  it("rewrites an already-sorted repeated key, because the shape is what is wrong", () => {
    expect(canonicalCatalogSearch({ tags: ["Art", "Mobility"] })).toEqual({ tags: "Art,Mobility" });
    expect(canonicalCatalogSearch({ tags: ["Art"] })).toEqual({ tags: "Art" });
  });

  it("drops a tagMatch that cannot mean anything", () => {
    expect(canonicalCatalogSearch({ tags: "Art", tagMatch: "all" })).toEqual({ tags: "Art" });
  });

  it("normalizes and sorts stable voucher references", () => {
    expect(
      canonicalCatalogSearch({
        vouchers: [
          "42220:0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
          "1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ],
        voucherMatch: "all",
      }),
    ).toEqual({
      vouchers:
        "1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,42220:0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      voucherMatch: "all",
    });
  });

  it("drops voucherMatch when fewer than two vouchers are selected", () => {
    expect(
      canonicalCatalogSearch({
        vouchers: "42220:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        voucherMatch: "all",
      }),
    ).toEqual({ vouchers: "42220:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" });
  });

  it("leaves an invalid or over-limit voucher filter untouched", () => {
    expect(canonicalCatalogSearch({ vouchers: "42220:not-an-address" })).toBeNull();
    const vouchers = Array.from(
      { length: CATALOG_MAX_VOUCHERS + 1 },
      (_, index) => `42220:0x${index.toString(16).padStart(40, "0")}`,
    );
    expect(canonicalCatalogSearch({ vouchers })).toBeNull();
  });

  it("drops a term below the minimum", () => {
    expect(canonicalCatalogSearch({ q: "a" })).toEqual({});
  });

  it("leaves an over-limit filter untouched, having no canonical form to offer", () => {
    const tags = Array.from({ length: CATALOG_MAX_TAGS + 1 }, (_, index) => `Tag${index}`);
    expect(canonicalCatalogSearch({ tags })).toBeNull();
  });
});

describe("canonicalizing redirect", () => {
  it("returns nothing when there is nothing to correct", () => {
    expect(canonicalRedirectSearch(validated({}))).toBeNull();
    expect(canonicalRedirectSearch(validated({ q: "art" }))).toBeNull();
  });

  it("is idempotent: its own output needs no further correction", () => {
    const first = canonicalRedirectSearch(validated({ q: "  art " }));
    expect(first).toMatchObject({ q: "art" });

    expect(canonicalRedirectSearch(validated(first ?? {}))).toBeNull();
  });

  it("carries the coerced keys through unchanged", () => {
    const next = canonicalRedirectSearch(validated({ q: "  art " }));

    expect(next).toEqual({ tab: "market", view: "map", q: "art" });
  });

  it("redirects an already-sorted repeated key to the single-key form", () => {
    const next = canonicalRedirectSearch(validated({ tags: ["Art", "Mobility"] }));

    expect(next).toMatchObject({ tags: "Art,Mobility" });
    expect(canonicalRedirectSearch(validated(next ?? {}))).toBeNull();
  });

  it("preserves a non-default coerced value", () => {
    const next = canonicalRedirectSearch(validated({ view: "list", q: "  art " }));

    expect(next).toMatchObject({ view: "list", q: "art" });
  });

  it("removes a filter key the canonical form drops rather than blanking it", () => {
    const next = canonicalRedirectSearch(validated({ tags: "Art", tagMatch: "all" }));

    expect(next).toMatchObject({ tags: "Art" });
    expect(next && "tagMatch" in next && next.tagMatch).toBeFalsy();
  });

  it("passes unrelated search keys through untouched", () => {
    const search = { ...validated({ q: "  art " }), from: "wallet" };
    const next = canonicalRedirectSearch(search);

    expect(next).toMatchObject({ from: "wallet", q: "art" });
  });

  it("does not redirect an over-limit URL", () => {
    const tags = Array.from({ length: CATALOG_MAX_TAGS + 1 }, (_, index) => `Tag${index}`);
    expect(canonicalRedirectSearch(validated({ tags }))).toBeNull();
  });
});
