import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  POSTED_WITHIN_PREFERENCE_NAME,
  readPostedWithinPreference,
  writePostedWithinPreference,
} from "./catalog-filter-preference-storage";
import { canonicalPostedSearch, parsePostedSearch, pickPostedSearch } from "./posted-search";
import { ownerScopedKey } from "#/lib/storage/owner-tier-key";

describe("posted search", () => {
  it("picks a string or the first repeated value", () => {
    expect(pickPostedSearch({ posted: "all" })).toEqual({ posted: "all" });
    expect(pickPostedSearch({ posted: ["6m", "1y"] })).toEqual({ posted: "6m" });
    expect(pickPostedSearch({ tab: "posts" })).toEqual({});
  });

  it("defaults missing and unknown values to 1 month", () => {
    expect(parsePostedSearch({})).toBe("1m");
    expect(parsePostedSearch({ posted: "2m" })).toBe("1m");
    expect(parsePostedSearch({ posted: "3m" })).toBe("3m");
    expect(parsePostedSearch({ posted: "all" })).toBe("all");
  });

  it("keeps explicit defaults and normalizes unknown values", () => {
    expect(canonicalPostedSearch({})).toBeNull();
    expect(canonicalPostedSearch({ posted: "all" })).toBeNull();
    expect(canonicalPostedSearch({ posted: "3m" })).toBeNull();
    expect(canonicalPostedSearch({ posted: "1m" })).toBeNull();
    expect(canonicalPostedSearch({ posted: "2m" })).toEqual({ posted: "1m" });
  });
});

describe("posted preference", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("remembers a non-default window and forgets 1 month", () => {
    expect(readPostedWithinPreference("guest")).toBeNull();
    writePostedWithinPreference("guest", "all");
    expect(readPostedWithinPreference("guest")).toBe("all");
    expect(
      window.localStorage.getItem(ownerScopedKey("guest", POSTED_WITHIN_PREFERENCE_NAME)),
    ).toBe("all");
    writePostedWithinPreference("guest", "1m");
    expect(readPostedWithinPreference("guest")).toBeNull();
    expect(
      window.localStorage.getItem(ownerScopedKey("guest", POSTED_WITHIN_PREFERENCE_NAME)),
    ).toBeNull();
  });
});
