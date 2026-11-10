import { describe, expect, it } from "vite-plus/test";

import {
  canonicalActivityRouteSearch,
  clearActivityRouteSearch,
  parseActivityDeskFilters,
  parseActivitySearch,
  parseActivitySection,
  pickActivitySearch,
} from "./activity-search";

describe("activity search", () => {
  it("normalizes repeated mixed-case types in stable display order", () => {
    expect(parseActivitySearch({ activityTypes: [" SWAPPED,sent ", "creation", "SENT"] })).toEqual({
      q: "",
      types: ["creation", "sent", "swapped"],
    });
  });

  it("preserves pool filters in activity URLs", () => {
    expect(parseActivitySearch({ activityTypes: "POOL_PAYOUT,deposited" }).types).toEqual([
      "deposited",
      "pool_payout",
    ]);
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
      tx: undefined,
    });
  });

  it("marks malformed non-string values for canonical removal", () => {
    expect(pickActivitySearch({ activityTypes: 3 })).toEqual({
      activityTypes: ["__invalid__"],
    });
    expect(canonicalActivityRouteSearch({ activityTypes: 3 })).not.toBeNull();
  });

  it("checksums the desktop voucher filter and drops an unknown range", () => {
    const lower = "0x5c0d0000000000000000000000000000000e7e21";
    const search = { activityVoucher: lower, activityRange: "1y" };
    const checksummed = parseActivityDeskFilters(search).voucher;
    expect(checksummed).toBe("0x5C0d0000000000000000000000000000000E7E21");
    expect(parseActivityDeskFilters(search).range).toBeUndefined();
    expect(canonicalActivityRouteSearch(search)).toEqual({
      activityQ: undefined,
      activityTypes: undefined,
      activityVoucher: checksummed,
      activityRange: undefined,
    });
    expect(
      canonicalActivityRouteSearch({ activityVoucher: checksummed, activityRange: "30d" }),
    ).toBeNull();
  });

  it("reads the sub-tab, defaulting to Transactions", () => {
    expect(parseActivitySection("messages")).toBe("messages");
    expect(parseActivitySection("helpdesk")).toBe("helpdesk");
    expect(parseActivitySection("bogus")).toBe("transactions");
    expect(parseActivitySection(undefined)).toBe("transactions");
  });

  it("keeps a valid sub-tab and drops the default or an unknown one", () => {
    expect(canonicalActivityRouteSearch({ section: "messages" })).toBeNull();
    expect(canonicalActivityRouteSearch({ section: "transactions" })).toMatchObject({
      section: undefined,
    });
    expect(canonicalActivityRouteSearch({ section: "inbox" })).toMatchObject({
      section: undefined,
    });
    expect(clearActivityRouteSearch()).toHaveProperty("section", undefined);
  });
});
