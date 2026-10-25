import { describe, expect, it } from "vite-plus/test";

import { marketplaceResultSchema, marketplaceScopeSchema } from "./logic";

const base = {
  id: 7,
  name: "Repair bicycles",
  description: null,
  imageUrl: null,
  markerIcon: null,
  markerColor: null,
  voucherKind: null,
  locationName: "Kilifi",
  geoLat: -3.63,
  geoLng: 39.85,
  distanceMeters: 125,
  tags: ["Repair"],
  createdAt: "2026-10-12T10:00:00Z",
  updatedAt: "2026-10-12T10:00:00Z",
};

describe("marketplace result contracts", () => {
  it("accepts every list scope but keeps All implicit", () => {
    expect(marketplaceScopeSchema.options).toEqual([
      "offers",
      "wants",
      "vouchers",
      "pools",
      "catalogs",
    ]);
    expect(marketplaceScopeSchema.safeParse("all").success).toBe(false);
  });

  it("parses an offering with its parent voucher and exact UoA price", () => {
    const parsed = marketplaceResultSchema.parse({
      ...base,
      kind: "offering",
      chainId: 100,
      address: `0x${"a".repeat(40)}`,
      symbol: "BIKE",
      voucherAddress: `0x${"a".repeat(40)}`,
      voucherName: "Bike Repair",
      voucherSymbol: "BIKE",
      voucherUoa: "KES",
      priceInUnitOfAccount: "122.500000000000000001",
      unit: "service",
      poolCount: null,
      voucherCount: null,
    });
    expect(parsed.kind).toBe("offering");
    expect(parsed.priceInUnitOfAccount).toBe("122.500000000000000001");
  });

  it("requires spatial data and kind-specific relationships", () => {
    const malformed = {
      ...base,
      kind: "catalog",
      chainId: null,
      address: null,
      symbol: null,
      voucherAddress: null,
      voucherName: null,
      voucherSymbol: null,
      voucherUoa: null,
      priceInUnitOfAccount: null,
      unit: null,
      poolCount: 2,
      voucherCount: 3,
      geoLat: 91,
    };
    expect(marketplaceResultSchema.safeParse(malformed).success).toBe(false);
  });
});
