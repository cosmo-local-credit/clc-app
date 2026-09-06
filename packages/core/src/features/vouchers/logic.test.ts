import { decodeFunctionData } from "viem";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  buildVoucherMintCall,
  giftableTokenMintToAbi,
  toVoucherDeployPayload,
  voucherCreateSchema,
  voucherMintAmountSchema,
  type VoucherCreateInput,
} from "./logic";

const validVoucher: VoucherCreateInput = {
  name: "Kilifi Harvest",
  symbol: "KHV",
  price: "1",
  unitOfAccount: "KES",
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
  website: "https://kilifi.example",
  phone: "+254712345678",
  terms: "https://kilifi.example/terms",
  acceptedTerms: true,
  acceptedPathLicense: true,
};

describe("voucherCreateSchema", () => {
  it("accepts the standard voucher defaults without an expiration date", () => {
    expect(voucherCreateSchema.safeParse(validVoucher).success).toBe(true);
  });

  it("accepts currencies beyond the former three-option list", () => {
    expect(voucherCreateSchema.safeParse({ ...validVoucher, unitOfAccount: "TZS" }).success).toBe(
      true,
    );
    expect(voucherCreateSchema.safeParse({ ...validVoucher, unitOfAccount: "EUR" }).success).toBe(
      true,
    );
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

  it("requires at least three characters for the voucher identity fields", () => {
    for (const field of ["name", "symbol", "description"] as const) {
      const result = voucherCreateSchema.safeParse({ ...validVoucher, [field]: "ab" });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toContainEqual(
          expect.objectContaining({
            path: [field],
            message: expect.stringContaining("at least 3"),
          }),
        );
      }
    }
  });

  it("accepts only blank or valid HTTP website URLs", () => {
    expect(voucherCreateSchema.safeParse({ ...validVoucher, website: "" }).success).toBe(true);
    expect(
      voucherCreateSchema.safeParse({ ...validVoucher, website: "https://kilifi.example" }).success,
    ).toBe(true);
    expect(
      voucherCreateSchema.safeParse({ ...validVoucher, website: "kilifi.example" }).success,
    ).toBe(false);
  });

  it("accepts only blank or valid HTTP terms URLs", () => {
    expect(voucherCreateSchema.safeParse({ ...validVoucher, terms: "" }).success).toBe(true);
    expect(
      voucherCreateSchema.safeParse({
        ...validVoucher,
        terms: "https://kilifi.example/terms",
      }).success,
    ).toBe(true);
    expect(
      voucherCreateSchema.safeParse({ ...validVoucher, terms: "kilifi.example/terms" }).success,
    ).toBe(false);
  });

  it("requires both legal agreements", () => {
    const withoutTerms = voucherCreateSchema.safeParse({ ...validVoucher, acceptedTerms: false });
    const withoutPathLicense = voucherCreateSchema.safeParse({
      ...validVoucher,
      acceptedPathLicense: false,
    });

    expect(withoutTerms.success).toBe(false);
    expect(withoutPathLicense.success).toBe(false);
  });
});

describe("toVoucherDeployPayload", () => {
  it("maps voucher metadata and omits blank optional fields", () => {
    expect(
      toVoucherDeployPayload(
        { ...validVoucher, email: "", website: "", phone: "", terms: "" },
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

  it("maps the voucher terms URL into the deploy payload", () => {
    expect(
      toVoucherDeployPayload(validVoucher, "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d").terms,
    ).toBe("https://kilifi.example/terms");
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

describe("voucherMintAmountSchema", () => {
  it("accepts whole and fractional supply within the voucher's decimals", () => {
    expect(voucherMintAmountSchema(6).safeParse("10000").success).toBe(true);
    expect(voucherMintAmountSchema(6).safeParse("0.500000").success).toBe(true);
  });

  it("rejects zero, negative and non-numeric supply", () => {
    for (const value of ["0", "0.0", "-5", "", "abc", "1e6"]) {
      expect(voucherMintAmountSchema(6).safeParse(value).success).toBe(false);
    }
  });

  it("rejects supply finer than the voucher's decimals", () => {
    const result = voucherMintAmountSchema(2).safeParse("1.234");

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "Supply has more decimal places than this voucher supports",
    );
  });

  it("accepts only whole amounts for a zero-decimal voucher", () => {
    expect(voucherMintAmountSchema(0).safeParse("25").success).toBe(true);
    expect(voucherMintAmountSchema(0).safeParse("25.5").success).toBe(false);
  });
});

describe("buildVoucherMintCall", () => {
  const tokenAddress = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as const;
  const ownerAddress = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as const;

  it("mints the raw amount to the issuer's own wallet", () => {
    const call = buildVoucherMintCall({ tokenAddress, ownerAddress, amountRaw: "10000000000" });

    expect(call.to).toBe(tokenAddress);
    expect(call.value).toBe("0");
    expect(decodeFunctionData({ abi: giftableTokenMintToAbi, data: call.data })).toEqual({
      functionName: "mintTo",
      args: [ownerAddress, 10_000_000_000n],
    });
  });

  it("rejects a non-integer or non-positive raw amount", () => {
    for (const amountRaw of ["0", "-1", "1.5", "", "1e6"]) {
      expect(() => buildVoucherMintCall({ tokenAddress, ownerAddress, amountRaw })).toThrow();
    }
  });
});
