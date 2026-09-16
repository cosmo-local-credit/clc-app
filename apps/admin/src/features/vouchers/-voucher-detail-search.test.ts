import { describe, expect, it } from "vite-plus/test";
import { parseVoucherDetailSearch } from "./voucher-detail-search";

describe("parseVoucherDetailSearch", () => {
  it("defaults to offerings", () => {
    expect(parseVoucherDetailSearch({})).toEqual({ tab: "offerings" });
  });

  it("keeps a known tab", () => {
    expect(parseVoucherDetailSearch({ tab: "transactions" })).toEqual({ tab: "transactions" });
    expect(parseVoucherDetailSearch({ tab: "reports" })).toEqual({ tab: "reports" });
    expect(parseVoucherDetailSearch({ tab: "pools" })).toEqual({ tab: "pools" });
  });

  it("falls back when the URL tab is unknown", () => {
    expect(parseVoucherDetailSearch({ tab: "edit" })).toEqual({ tab: "offerings" });
  });
});
