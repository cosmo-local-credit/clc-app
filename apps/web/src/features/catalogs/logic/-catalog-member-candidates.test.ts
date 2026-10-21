import { describe, expect, it } from "vite-plus/test";

import {
  excludeCatalogMembers,
  prioritizeCatalogMemberCandidates,
  toCatalogMemberCandidate,
  type CatalogMemberCandidate,
} from "./catalog-member-candidates";

const ADDRESS_A = `0x${"a".repeat(40)}` as const;
const ADDRESS_B = `0x${"b".repeat(40)}` as const;
const ADDRESS_C = `0x${"c".repeat(40)}` as const;

function candidate(
  id: string,
  address: `0x${string}`,
  name = `Candidate ${id}`,
): CatalogMemberCandidate {
  return { id, chainId: 100, address, name, symbol: `C${id}`, imageUrl: null };
}

describe("catalog member candidates", () => {
  it("rejects malformed identifiers, chains, addresses, and blank identity", () => {
    expect(
      toCatalogMemberCandidate({
        id: "0",
        chainId: 100,
        address: ADDRESS_A,
        name: "Voucher",
        symbol: "V",
        imageUrl: null,
      }),
    ).toBeNull();
    expect(
      toCatalogMemberCandidate({
        id: "1",
        chainId: null,
        address: ADDRESS_A,
        name: "Voucher",
        symbol: "V",
        imageUrl: null,
      }),
    ).toBeNull();
    expect(
      toCatalogMemberCandidate({
        id: "1",
        chainId: 100,
        address: "not-an-address",
        name: "Voucher",
        symbol: "V",
        imageUrl: null,
      }),
    ).toBeNull();
    expect(
      toCatalogMemberCandidate({
        id: "1",
        chainId: 100,
        address: ADDRESS_A,
        name: "Voucher",
        symbol: " ",
        imageUrl: null,
      }),
    ).toBeNull();
  });

  it("normalizes valid candidates", () => {
    expect(
      toCatalogMemberCandidate({
        id: 1,
        chainId: 100,
        address: ADDRESS_A,
        name: " Voucher ",
        symbol: " VCH ",
        imageUrl: undefined,
      }),
    ).toEqual({
      id: "1",
      chainId: 100,
      address: ADDRESS_A,
      name: "Voucher",
      symbol: "VCH",
      imageUrl: null,
    });
  });

  it("removes complete membership before preserving source priority", () => {
    const first = candidate("1", ADDRESS_A);
    const duplicateAddress = candidate("9", ADDRESS_A.toUpperCase() as `0x${string}`);
    const second = candidate("2", ADDRESS_B);
    const existingById = candidate("3", ADDRESS_C);
    const existingByAddress = candidate("4", ADDRESS_C);

    expect(
      prioritizeCatalogMemberCandidates(
        [
          [first, existingById],
          [duplicateAddress, second, existingByAddress],
        ],
        [
          { id: "3", address: `0x${"d".repeat(40)}` },
          { id: "8", address: ADDRESS_C.toUpperCase() },
        ],
      ),
    ).toEqual([[first], [second]]);
  });

  it("filters search rows against members and within the result", () => {
    const first = candidate("1", ADDRESS_A);
    const duplicate = candidate("9", ADDRESS_A);
    const existing = candidate("2", ADDRESS_B);
    expect(
      excludeCatalogMembers([first, duplicate, existing], [{ id: "2", address: ADDRESS_C }]),
    ).toEqual([first]);
  });
});
