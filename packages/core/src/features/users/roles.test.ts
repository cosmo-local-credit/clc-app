import { describe, expect, it } from "vite-plus/test";
import { isAdminRole, isSuperAdminRole, isUserRole } from "./roles";

describe("user roles", () => {
  it.each(["USER", "ADMIN", "SUPERADMIN"])("recognizes %s", (role) => {
    expect(isUserRole(role)).toBe(true);
  });

  it("grants administrative access to Admin and Superadmin only", () => {
    expect(isAdminRole("ADMIN")).toBe(true);
    expect(isAdminRole("SUPERADMIN")).toBe(true);
    expect(isAdminRole("USER")).toBe(false);
  });

  it("keeps role management superadmin-only", () => {
    expect(isSuperAdminRole("SUPERADMIN")).toBe(true);
    expect(isSuperAdminRole("ADMIN")).toBe(false);
  });
});
