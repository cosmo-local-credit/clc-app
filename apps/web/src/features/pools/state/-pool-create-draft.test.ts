import { afterEach, describe, expect, it } from "vite-plus/test";
import { usePoolCreateDraft } from "./pool-create-draft";

const submittedPool = {
  name: "Kilifi Growers",
  symbol: "KGP1",
  unit: "KES" as const,
  description: "A growers pool.",
  pricing: "oracle" as const,
  feePolicyDefault: "1",
  feesDecoupled: false,
  location: { locationName: "Kilifi, Kenya", country: "KE", lat: -3.5, lng: 39.9 },
  tags: ["Agriculture"],
  email: "",
  website: "",
  phone: "",
  terms: "",
  acceptedTerms: true as const,
  acceptedSproutLicense: true as const,
};

afterEach(() => {
  usePoolCreateDraft.getState().clearDraft();
});

describe("pool create retry snapshot", () => {
  it("stores submitted values for retry and clears them on exit", () => {
    usePoolCreateDraft.getState().setDraft(submittedPool);
    expect(usePoolCreateDraft.getState().draft).toEqual(submittedPool);

    usePoolCreateDraft.getState().clearDraft();
    expect(usePoolCreateDraft.getState().draft).toBeNull();
  });
});
