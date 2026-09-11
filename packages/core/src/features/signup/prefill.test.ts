import { describe, expect, it } from "vite-plus/test";

import { profilePrefill } from "./prefill";

describe("profilePrefill", () => {
  it("carries the saved contact details, bio, avatar and location across", () => {
    expect(
      profilePrefill({
        email: " steward@example.org ",
        phone: "+254712345678",
        website: "https://steward.example",
        bio: "We grow and trade around Kilifi.",
        preferredCurrency: "tzs",
        country: "KE",
        locationName: "Kilifi, Kenya",
        geoLat: -3.5107,
        geoLng: 39.9093,
        avatarUrl: "https://cdn.test/profile/avatar.webp",
      }),
    ).toEqual({
      email: "steward@example.org",
      phone: "+254712345678",
      website: "https://steward.example",
      description: "We grow and trade around Kilifi.",
      location: {
        lat: -3.5107,
        lng: 39.9093,
        locationName: "Kilifi, Kenya",
        country: "KE",
      },
      unitOfAccount: "TZS",
      imageUrl: "https://cdn.test/profile/avatar.webp",
    });
  });

  it("drops the signup placeholder address rather than publishing it as a contact", () => {
    expect(profilePrefill({ email: "0xabc@clc.local" }).email).toBe("");
  });

  it("yields no location unless all four parts were saved", () => {
    expect(
      profilePrefill({ locationName: "Kilifi, Kenya", geoLat: -3.5107, geoLng: 39.9093 }).location,
    ).toBeUndefined();
  });

  it("ignores a preferred currency this app does not offer as a unit", () => {
    expect(profilePrefill({ preferredCurrency: "XYZ" }).unitOfAccount).toBeUndefined();
  });

  it("reads a profile from a backend that predates preferences as empty", () => {
    expect(profilePrefill({})).toEqual({
      email: "",
      phone: "",
      website: "",
      description: "",
      location: undefined,
      unitOfAccount: undefined,
      imageUrl: "",
    });
  });
});
