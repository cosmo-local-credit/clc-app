import { expect, it } from "vite-plus/test";
import { isAccountNearbyScope } from "./nearby";

it("restricts profile-based server filtering to account scopes", () => {
  expect(isAccountNearbyScope("nearby:0xabc:100:0:0:500")).toBe(true);
  expect(isAccountNearbyScope("guest-nearby:0:0:500")).toBe(false);
  expect(isAccountNearbyScope(undefined)).toBe(false);
});
