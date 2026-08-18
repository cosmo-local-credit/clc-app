import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_PAGE_SIZE } from "#/lib/table-search";
import { ACCOUNT_DETAIL_TABS, parseUserDetailSearch } from "./user-detail-search";

describe("parseUserDetailSearch", () => {
  it("defaults to the transactions tab on the first page", () => {
    expect(parseUserDetailSearch({})).toEqual({
      tab: "transactions",
      perPage: DEFAULT_PAGE_SIZE,
    });
  });

  it("keeps every known tab", () => {
    for (const tab of ACCOUNT_DETAIL_TABS) {
      expect(parseUserDetailSearch({ tab })).toMatchObject({ tab });
    }
  });

  it("normalizes an unknown tab instead of throwing", () => {
    // A hand-edited or stale URL should degrade to a usable screen rather than an
    // error boundary.
    for (const tab of ["holdings", "", 3, null, undefined]) {
      expect(parseUserDetailSearch({ tab })).toMatchObject({ tab: "transactions" });
    }
  });

  it("carries the record table's page state", () => {
    // The tab and the cursor share one search object, so a linked URL restores both
    // the tab and the page within it.
    expect(
      parseUserDetailSearch({ tab: "transactions", perPage: "50", cursor: "4187", dir: "next" }),
    ).toEqual({ tab: "transactions", perPage: 50, cursor: 4187, dir: "next" });
  });

  it("clamps an unsupported page size rather than requesting it", () => {
    expect(parseUserDetailSearch({ perPage: "100000" })).toMatchObject({
      perPage: DEFAULT_PAGE_SIZE,
    });
  });
});
