import { describe, expect, it } from "vite-plus/test";
import { parsePoolDetailSearch } from "./pool-detail-search";

describe("parsePoolDetailSearch", () => {
  it("defaults a missing, invalid, or retired overview tab to vouchers", () => {
    expect(parsePoolDetailSearch({})).toEqual({ tab: "vouchers" });
    expect(parsePoolDetailSearch({ tab: "fees" })).toEqual({ tab: "vouchers" });
    expect(parsePoolDetailSearch({ tab: "overview" })).toEqual({ tab: "vouchers" });
  });

  it("accepts the linkable record tabs", () => {
    expect(parsePoolDetailSearch({ tab: "vouchers" })).toEqual({ tab: "vouchers" });
    expect(parsePoolDetailSearch({ tab: "feeds" })).toEqual({ tab: "feeds" });
    expect(parsePoolDetailSearch({ tab: "offerings" })).toEqual({ tab: "offerings" });
    expect(parsePoolDetailSearch({ tab: "activity" })).toEqual({ tab: "activity" });
  });
});
