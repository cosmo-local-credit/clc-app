import { describe, expect, it } from "vite-plus/test";

import {
  canonicalActivityRouteSearch,
  clearActivityRouteSearch,
  parseActivitySearch,
  pickActivitySearch,
} from "./activity-search";

describe("activity search", () => {
  it("normalizes repeated mixed-case types in stable display order", () => {
    expect(parseActivitySearch({ activityTypes: [" SWAPPED,sent ", "creation", "SENT"] })).toEqual({
      q: "",
      types: ["creation", "sent", "swapped"],
    });
  });

  it("drops unknown types instead of leaking them to the backend", () => {
    expect(parseActivitySearch({ activityTypes: "received,unknown" })).toEqual({
      q: "",
      types: ["received"],
    });
    expect(canonicalActivityRouteSearch({ activityTypes: "received,unknown" })).toEqual({
      activityQ: undefined,
      activityTypes: "received",
    });
  });

  it("canonicalizes repeated and whitespace-heavy search parameters", () => {
    const search = { activityQ: ["  old   voucher  ", "ignored"] };
    expect(parseActivitySearch(search)).toEqual({ q: "old voucher", types: [] });
    expect(canonicalActivityRouteSearch(search)).toEqual({
      activityQ: "old voucher",
      activityTypes: undefined,
    });
  });

  it("recognizes an already canonical URL and clears both values", () => {
    expect(
      canonicalActivityRouteSearch({ activityQ: "old voucher", activityTypes: "sent,swapped" }),
    ).toBeNull();
    expect(clearActivityRouteSearch()).toEqual({
      activityQ: undefined,
      activityTypes: undefined,
    });
  });

  it("marks malformed non-string values for canonical removal", () => {
    expect(pickActivitySearch({ activityTypes: 3 })).toEqual({
      activityTypes: ["__invalid__"],
    });
    expect(canonicalActivityRouteSearch({ activityTypes: 3 })).not.toBeNull();
  });
});
