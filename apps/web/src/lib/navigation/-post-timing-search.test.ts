import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  readPostTimingPreference,
  writePostTimingPreference,
} from "./catalog-filter-preference-storage";
import {
  canonicalPostTimingSearch,
  parsePostTimingSearch,
  pickPostTimingSearch,
} from "./post-timing-search";
import { ownerScopedKey } from "#/lib/storage/owner-tier-key";

const LEGACY_PREFERENCE_NAME = "posts.posted-within.v1";

describe("Post timing search", () => {
  it("picks scalar and repeated values and defaults invalid timing to Future", () => {
    expect(pickPostTimingSearch({ timing: ["past", "all"] })).toEqual({ timing: "past" });
    expect(parsePostTimingSearch({})).toBe("future");
    expect(parsePostTimingSearch({ timing: "past" })).toBe("past");
    expect(parsePostTimingSearch({ timing: "later" })).toBe("future");
  });

  it("maps only the exact legacy all-time link and removes legacy parameters", () => {
    expect(parsePostTimingSearch({ posted: "all" })).toBe("all");
    expect(parsePostTimingSearch({ posted: "6m" })).toBe("future");
    expect(canonicalPostTimingSearch({ posted: "all" })).toEqual({
      timing: "all",
      posted: undefined,
    });
    expect(canonicalPostTimingSearch({ posted: "6m" })).toEqual({
      timing: undefined,
      posted: undefined,
    });
  });

  it("omits Future from canonical URLs and retains Past and All", () => {
    expect(canonicalPostTimingSearch({})).toBeNull();
    expect(canonicalPostTimingSearch({ timing: "past" })).toBeNull();
    expect(canonicalPostTimingSearch({ timing: "all" })).toBeNull();
    expect(canonicalPostTimingSearch({ timing: "future" })).toEqual({
      timing: undefined,
      posted: undefined,
    });
    expect(canonicalPostTimingSearch({ timing: "later" })).toEqual({
      timing: undefined,
      posted: undefined,
    });
  });
});

describe("Post timing preference", () => {
  afterEach(() => window.localStorage.clear());

  it("remembers non-default timing and removes the Future baseline", () => {
    writePostTimingPreference("guest", "past");
    expect(readPostTimingPreference("guest")).toBe("past");
    expect(window.localStorage.getItem(ownerScopedKey("guest", "posts.timing.v1"))).toBe("past");

    writePostTimingPreference("guest", "future");
    expect(readPostTimingPreference("guest")).toBeNull();
  });

  it("migrates legacy All and discards creation-age windows", () => {
    window.localStorage.setItem(ownerScopedKey("guest", LEGACY_PREFERENCE_NAME), "all");
    expect(readPostTimingPreference("guest")).toBe("all");
    expect(window.localStorage.getItem(ownerScopedKey("guest", LEGACY_PREFERENCE_NAME))).toBeNull();

    window.localStorage.setItem(ownerScopedKey("guest", LEGACY_PREFERENCE_NAME), "6m");
    expect(readPostTimingPreference("guest")).toBeNull();
    expect(window.localStorage.getItem(ownerScopedKey("guest", LEGACY_PREFERENCE_NAME))).toBeNull();
  });
});
