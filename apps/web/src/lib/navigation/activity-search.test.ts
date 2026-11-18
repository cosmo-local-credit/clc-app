import { describe, expect, it } from "vite-plus/test";

import {
  canonicalActivityRouteSearch,
  clearActivityRouteSearch,
  parseActivityDeskFilters,
  parseActivityMessageContext,
  parseActivityMessageTo,
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
      activityRange: undefined,
      activityVoucher: undefined,
      activityQ: undefined,
      activityTypes: undefined,
      messageTo: undefined,
      section: undefined,
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

  it("checksums a message recipient and removes invalid prefill values", () => {
    const lower = "0x5c0d0000000000000000000000000000000e7e21";
    const checksummed = "0x5C0d0000000000000000000000000000000E7E21";
    expect(parseActivityMessageTo(lower)).toBe(checksummed);
    expect(canonicalActivityRouteSearch({ section: "messages", messageTo: lower })).toEqual({
      section: "messages",
      activityQ: undefined,
      activityTypes: undefined,
      messageTo: checksummed,
    });
    expect(
      canonicalActivityRouteSearch({ section: "messages", messageTo: checksummed }),
    ).toBeNull();
    expect(
      canonicalActivityRouteSearch({ section: "messages", messageTo: "not-an-address" }),
    ).toEqual({
      section: "messages",
      activityQ: undefined,
      activityTypes: undefined,
      messageTo: undefined,
    });
  });

  it("canonicalizes resource context and an optional Pool voucher proposal", () => {
    const pool = "0x5c0d0000000000000000000000000000000e7e21";
    const voucher = "0x1111111111111111111111111111111111111111";
    const context = parseActivityMessageContext({
      messageKind: "pool",
      messageResource: pool,
      messageVoucher: voucher,
    });

    expect(context).toEqual({
      kind: "pool",
      resourceId: "0x5C0d0000000000000000000000000000000E7E21",
      proposedVoucherAddress: voucher,
    });
    expect(
      canonicalActivityRouteSearch({
        section: "messages",
        messageKind: "pool",
        messageResource: pool,
        messageVoucher: voucher,
      }),
    ).toEqual({
      section: "messages",
      activityQ: undefined,
      activityTypes: undefined,
      messageKind: "pool",
      messageResource: "0x5C0d0000000000000000000000000000000E7E21",
      messageVoucher: voucher,
    });
  });

  it("accepts Want and Catalog context while dropping invalid combinations", () => {
    expect(parseActivityMessageContext({ messageKind: "want", messageResource: "42" })).toEqual({
      kind: "want",
      resourceId: "42",
    });
    expect(parseActivityMessageContext({ messageKind: "catalog", messageResource: "7" })).toEqual({
      kind: "catalog",
      resourceId: "7",
    });
    expect(
      parseActivityMessageContext({
        messageKind: "voucher",
        messageResource: "not-an-address",
      }),
    ).toBeUndefined();
    expect(
      parseActivityMessageContext({
        messageKind: "want",
        messageResource: "42",
        messageVoucher: "0x1111111111111111111111111111111111111111",
      }),
    ).toEqual({ kind: "want", resourceId: "42" });
  });
});
