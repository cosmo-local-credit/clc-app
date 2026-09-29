import { describe, expect, it } from "vite-plus/test";
import { BRAND_PRIMARY_COLOR, resolveBrand } from "./brand";

describe("resolveBrand", () => {
  it("reads the two brands the product deploys under", () => {
    expect(resolveBrand("prod")).toBe("prod");
    expect(resolveBrand("staging")).toBe("staging");
    expect(resolveBrand(" staging ")).toBe("staging");
  });

  // A build with no VITE_BRAND is a misconfigured prod deploy far more often
  // than it is staging, and prod wearing staging's colours is the worse mistake.
  it("falls back to prod when the variable is missing or empty", () => {
    expect(resolveBrand(undefined)).toBe("prod");
    expect(resolveBrand("  ")).toBe("prod");
  });

  it("fails the build on a typo rather than guessing", () => {
    expect(() => resolveBrand("production")).toThrow(/not a brand/);
  });
});

describe("BRAND_PRIMARY_COLOR", () => {
  it("gives each brand a light and dark sRGB primary", () => {
    expect(BRAND_PRIMARY_COLOR.prod.light).toBe("#007a55");
    expect(BRAND_PRIMARY_COLOR.staging.light).toBe("#e7000b");
    expect(BRAND_PRIMARY_COLOR.prod.dark).not.toBe(BRAND_PRIMARY_COLOR.staging.dark);
  });
});
