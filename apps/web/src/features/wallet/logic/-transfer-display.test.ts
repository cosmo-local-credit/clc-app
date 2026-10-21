import { describe, expect, it } from "vite-plus/test";

import { formatTransferDate, formatTransferUnitValue } from "./transfer-display";

describe("formatTransferDate", () => {
  it("formats transfer timestamps with native short date and time formatting", () => {
    expect(formatTransferDate("2026-07-02T15:20:29Z", "en-US", "UTC")).toBe("Jul 2, 3:20 PM");
  });
});

describe("formatTransferUnitValue", () => {
  it("localizes historical values without converting through Number", () => {
    expect(formatTransferUnitValue("9007199254740993.25", "KES", "de")).toBe(
      "9.007.199.254.740.993,25 KES",
    );
  });

  it("rounds display values to two decimals while keeping tiny positives visible", () => {
    expect(formatTransferUnitValue("1.000001", "KES", "en")).toBe("1.00 KES");
    expect(formatTransferUnitValue("1.005", "KES", "en")).toBe("1.01 KES");
    expect(formatTransferUnitValue("0.000001", "KES", "en")).toBe("<0.01 KES");
  });

  it.each([
    [undefined, "KES"],
    ["10", undefined],
    ["1e2", "KES"],
    ["10", "x".repeat(33)],
  ])("hides incomplete or malformed snapshots", (value, unit) => {
    expect(formatTransferUnitValue(value, unit, "en")).toBeNull();
  });
});
