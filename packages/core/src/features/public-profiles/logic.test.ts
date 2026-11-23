import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_PROFILE_VISIBILITY,
  profileVisibilitySchema,
  publicProfileSchema,
  publicProfileDetailsSchema,
} from "./logic";

describe("profile publication boundary", () => {
  it("publishes existing identity and commerce while sensitive associations require consent", () => {
    expect(profileVisibilitySchema.parse(DEFAULT_PROFILE_VISIBILITY)).toEqual(
      DEFAULT_PROFILE_VISIBILITY,
    );
    expect(
      Object.entries(DEFAULT_PROFILE_VISIBILITY)
        .filter(([, enabled]) => enabled)
        .map(([key]) => key),
    ).toEqual(["enabled", "avatar", "vouchers", "offers", "wants", "pools", "catalogs"]);
    expect(
      profileVisibilitySchema.safeParse({ ...DEFAULT_PROFILE_VISIBILITY, posts: "true" }).success,
    ).toBe(false);
  });
  it("public projections discard private and administrative fields", () => {
    const result = publicProfileSchema.parse({
      address: `0x${"a".repeat(40)}`,
      username: "alice",
      sections: {
        vouchers: true,
        offers: true,
        wants: true,
        pools: true,
        catalogs: true,
        posts: false,
        activity: false,
      },
      hasPrivateDetails: false,
      email: "secret@example.test",
      role: "ADMIN",
      maxPools: 10,
    });
    expect(result).not.toHaveProperty("email");
    expect(result).not.toHaveProperty("role");
    expect(result).not.toHaveProperty("maxPools");
  });
  it("rejects impossible protected location values", () => {
    expect(publicProfileDetailsSchema.safeParse({ geoLat: 91, geoLng: 0 }).success).toBe(false);
    expect(publicProfileDetailsSchema.safeParse({ geoLat: 1, geoLng: Infinity }).success).toBe(
      false,
    );
  });
});
