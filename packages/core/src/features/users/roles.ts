const userRoles = ["USER", "ADMIN", "SUPERADMIN"] as const;

export type UserRole = (typeof userRoles)[number];

export function isUserRole(role: unknown): role is UserRole {
  return typeof role === "string" && userRoles.includes(role as UserRole);
}

export function isAdminRole(role: unknown): role is "ADMIN" | "SUPERADMIN" {
  return role === "ADMIN" || role === "SUPERADMIN";
}

export function isSuperAdminRole(role: unknown): role is "SUPERADMIN" {
  return role === "SUPERADMIN";
}
