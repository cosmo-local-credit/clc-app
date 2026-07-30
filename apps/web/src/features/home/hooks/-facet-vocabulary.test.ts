import { describe, expect, it } from "vite-plus/test";
import { ensureSelectedFacets } from "#/features/home/hooks/use-filtered-market-vouchers";

describe("ensureSelectedFacets", () => {
  it("leaves a facet alone when every selection is present", () => {
    const facets = [
      { tag: "Art", count: 3 },
      { tag: "Culture", count: 0 },
    ];
    expect(ensureSelectedFacets(facets, ["Art"])).toBe(facets);
  });

  it("adds a selected tag the vocabulary no longer offers, at zero", () => {
    const result = ensureSelectedFacets([{ tag: "Art", count: 3 }], ["Retired"]);
    expect(result).toEqual([
      { tag: "Art", count: 3 },
      { tag: "Retired", count: 0 },
    ]);
  });

  it("sorts an added tag into place rather than appending it", () => {
    const result = ensureSelectedFacets(
      [
        { tag: "Art", count: 1 },
        { tag: "Zebra", count: 2 },
      ],
      ["Mobility"],
    );
    expect(result.map((facet) => facet.tag)).toEqual(["Art", "Mobility", "Zebra"]);
  });

  it("handles an empty vocabulary", () => {
    expect(ensureSelectedFacets([], ["Art"])).toEqual([{ tag: "Art", count: 0 }]);
    expect(ensureSelectedFacets([], [])).toEqual([]);
  });
});
