import { describe, expect, it } from "vite-plus/test";
import { relaySnapshotUnitValue } from "./relay-valuation";

describe("relaySnapshotUnitValue", () => {
  const snapshots = [
    {
      tokenAddress: "0x1234567890123456789012345678901234567890" as const,
      voucherValue: "1.25",
      voucherUoa: "KES",
    },
  ];

  it("matches addresses case-insensitively and multiplies the exact amount", () => {
    expect(
      relaySnapshotUnitValue(
        snapshots,
        "0x1234567890123456789012345678901234567890".toUpperCase(),
        "9007199254740993.01",
      ),
    ).toEqual({ value: "11258999068426241.2625", unit: "KES" });
  });

  it("does not fall back when the relay returned no matching claim", () => {
    expect(
      relaySnapshotUnitValue(snapshots, "0x9999999999999999999999999999999999999999", "10"),
    ).toBeNull();
  });
});
