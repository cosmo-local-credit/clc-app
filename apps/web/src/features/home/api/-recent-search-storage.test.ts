import { beforeEach, describe, expect, it } from "vite-plus/test";

import { MAX_RECENT_SEARCHES, readRecentSearches, rememberSearch } from "./recent-search-storage";

const ALICE = "0xaaaa000000000000000000000000000000000001";
const BOB = "0xbbbb000000000000000000000000000000000002";

beforeEach(() => window.localStorage.clear());

describe("recent market searches", () => {
  it("keeps the newest first, once, whatever its case", () => {
    rememberSearch(ALICE, "Maize");
    rememberSearch(ALICE, "bike");
    rememberSearch(ALICE, "maize");

    expect(readRecentSearches(ALICE)).toEqual(["maize", "bike"]);
  });

  it(`keeps at most ${MAX_RECENT_SEARCHES}`, () => {
    for (const term of ["a1", "a2", "a3", "a4", "a5", "a6"]) rememberSearch(ALICE, term);

    expect(readRecentSearches(ALICE)).toEqual(["a6", "a5", "a4", "a3", "a2"]);
  });

  it("keeps each owner's searches apart, guests included", () => {
    rememberSearch(ALICE, "maize");
    rememberSearch("guest", "fish");

    expect(readRecentSearches(BOB)).toEqual([]);
    expect(readRecentSearches("guest")).toEqual(["fish"]);
  });

  it("drops an unreadable entry", () => {
    window.localStorage.setItem(`clc.t.${ALICE}.market.recent-searches.v1`, "{");

    expect(readRecentSearches(ALICE)).toEqual([]);
    expect(window.localStorage.getItem(`clc.t.${ALICE}.market.recent-searches.v1`)).toBeNull();
  });
});
