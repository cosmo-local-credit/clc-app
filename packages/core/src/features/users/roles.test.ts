import { describe, expect, it } from "vite-plus/test";
import { isAdminRole, isRegionalAdminRole, isSuperAdminRole, isUserRole } from "./roles";

describe("user roles", () => {
  it.each(["USER", "REGIONAL_ADMIN", "ADMIN", "SUPERADMIN"])("recognizes %s", (role) => {
    expect(isUserRole(role)).toBe(true);
  });

  it("grants administrative access to Admin and Superadmin only", () => {
    expect(isAdminRole("ADMIN")).toBe(true);
    expect(isAdminRole("SUPERADMIN")).toBe(true);
    expect(isAdminRole("USER")).toBe(false);
    expect(isAdminRole("REGIONAL_ADMIN")).toBe(false);
  });

  it("does not conflate the regional and global grants", () => {
    expect(isRegionalAdminRole("REGIONAL_ADMIN")).toBe(true);
    expect(isRegionalAdminRole("ADMIN")).toBe(false);
  });

  it("keeps role management superadmin-only", () => {
    expect(isSuperAdminRole("SUPERADMIN")).toBe(true);
    expect(isSuperAdminRole("ADMIN")).toBe(false);
  });
});
