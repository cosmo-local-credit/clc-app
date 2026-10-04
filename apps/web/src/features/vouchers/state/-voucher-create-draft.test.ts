import { afterEach, describe, expect, it } from "vite-plus/test";
import { useVoucherCreateDraft } from "./voucher-create-draft";

const submittedVoucher = {
  name: "Kilifi Harvest",
  symbol: "KHV",
  price: "1",
  unitOfAccount: "KES" as const,
  description: "Fresh food from Kilifi producers.",
  voucherType: "standard" as const,
  expiryDate: "",
  decimals: "6",
  supply: "1000",
  location: { locationName: "Kilifi, Kenya", country: "KE", lat: -3.5, lng: 39.9 },
  tags: ["Agriculture"],
  email: "issuer@example.org",
  website: "https://kilifi.example",
  phone: "+254712345678",
  terms: "https://kilifi.example/terms",
  markerIcon: null,
  markerColor: null,
  acceptedTerms: true as const,
};

afterEach(() => {
  useVoucherCreateDraft.getState().clearDraft();
});

describe("voucher create submitted snapshot", () => {
  it("stores submitted values for the receipt and clears them on exit", () => {
    useVoucherCreateDraft.getState().setDraft(submittedVoucher);
    expect(useVoucherCreateDraft.getState().draft).toEqual(submittedVoucher);

    useVoucherCreateDraft.getState().clearDraft();
    expect(useVoucherCreateDraft.getState().draft).toBeNull();
  });
});
