import { describe, expect, it, vi } from "vite-plus/test";
import { toVoucherDeployPayload, voucherCreateSchema, type VoucherCreateInput } from "./logic";

const validVoucher: VoucherCreateInput = {
  name: "Kilifi Harvest",
  symbol: "KHV",
  voucherValue: "1",
  voucherUoa: "KES",
  description: "Fresh food from Kilifi producers.",
  voucherType: "standard",
  expiryDate: "",
  decimals: "6",
  location: {
    locationName: "Kilifi, Kenya",
    country: "KE",
    lat: -3.5107,
    lng: 39.9093,
  },
  tags: ["Agriculture", "Food production"],
  email: "issuer@example.org",
  phone: "+254712345678",
  acceptedTerms: true,
};

describe("voucherCreateSchema", () => {
  it("accepts the standard voucher defaults without an expiration date", () => {
    expect(voucherCreateSchema.safeParse(validVoucher).success).toBe(true);
  });

  it("requires an expiration date for an expiring voucher", () => {
    const result = voucherCreateSchema.safeParse({
      ...validVoucher,
      voucherType: "expiring",
      expiryDate: "",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: ["expiryDate"], message: "Choose an expiration date" }),
      );
    }
  });

  it("rejects symbols that cannot fit the six-character ticker", () => {
    const result = voucherCreateSchema.safeParse({ ...validVoucher, symbol: "TOO-LONG" });
    expect(result.success).toBe(false);
  });
});

describe("toVoucherDeployPayload", () => {
  it("maps voucher metadata and omits blank optional fields", () => {
    expect(
      toVoucherDeployPayload(
        { ...validVoucher, email: "", phone: "" },
        "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d",
      ),
    ).toEqual({
      name: "Kilifi Harvest",
      symbol: "KHV",
      decimals: "6",
      owner: "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d",
      description: "Fresh food from Kilifi producers.",
      voucherUoa: "KES",
      voucherValue: 1,
      locationName: "Kilifi, Kenya",
      geoLat: -3.5107,
      geoLng: 39.9093,
      tags: ["Agriculture", "Food production"],
    });
  });

  it("sends the live deploy worker a Unix expiry timestamp", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const payload = toVoucherDeployPayload(
      { ...validVoucher, voucherType: "expiring", expiryDate: "2027-01-01" },
      "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d",
    );

    expect(payload.expiryTimestamp).toBe("1798761600");
    vi.useRealTimers();
  });
});
