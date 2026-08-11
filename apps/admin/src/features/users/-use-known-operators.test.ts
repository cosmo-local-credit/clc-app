import { describe, expect, it } from "vite-plus/test";
import { deriveOperators } from "./use-known-operators";

const OWNER_A = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";
const OWNER_B = "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0";

describe("deriveOperators", () => {
  it("collapses multiple pools owned by one address into a single operator", () => {
    const operators = deriveOperators([
      { name: "Kilifi Growers", ownerAddress: OWNER_A },
      { name: "Malindi Traders", ownerAddress: OWNER_A },
      { name: "Watamu Fishers", ownerAddress: OWNER_B },
    ]);

    expect(operators).toHaveLength(2);
    expect(operators[0]).toEqual({
      address: OWNER_A,
      poolCount: 2,
      owns: ["Kilifi Growers", "Malindi Traders"],
    });
    expect(operators[1]).toEqual({
      address: OWNER_B,
      poolCount: 1,
      owns: ["Watamu Fishers"],
    });
  });

  it("ignores pools with no owner address rather than inventing an operator", () => {
    const operators = deriveOperators([
      { name: "Orphan pool", ownerAddress: null },
      { name: "Kilifi Growers", ownerAddress: OWNER_A },
    ]);

    expect(operators).toHaveLength(1);
    expect(operators[0]?.address).toBe(OWNER_A);
  });

  it("returns nothing when no pool has an owner", () => {
    expect(deriveOperators([{ name: "Orphan pool", ownerAddress: null }])).toEqual([]);
  });

  it("sorts by pool count first, then by address so the order is stable", () => {
    const operators = deriveOperators([
      { name: "One", ownerAddress: OWNER_B },
      { name: "Two", ownerAddress: OWNER_A },
    ]);

    // Equal counts: OWNER_A ("0x1a…") sorts before OWNER_B ("0x45…").
    expect(operators.map((operator) => operator.address)).toEqual([OWNER_A, OWNER_B]);
  });
});
