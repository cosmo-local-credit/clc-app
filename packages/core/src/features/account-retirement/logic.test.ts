import { describe, expect, it } from "vite-plus/test";

import {
  accountRetirementPreviewSchema,
  isRecoveryLifecycle,
  managerClosureSchema,
  mayActOnAccount,
} from "./logic";

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";

describe("mayActOnAccount", () => {
  it("lets an admin act on users only", () => {
    const admin = { role: "ADMIN", address: A } as const;
    expect(mayActOnAccount(admin, { role: "USER", address: B })).toBe(true);
    expect(mayActOnAccount(admin, { role: "ADMIN", address: B })).toBe(false);
    expect(mayActOnAccount(admin, { role: "SUPERADMIN", address: B })).toBe(false);
  });

  it("lets a superadmin act on users and admins but never a superadmin", () => {
    const superadmin = { role: "SUPERADMIN", address: A } as const;
    expect(mayActOnAccount(superadmin, { role: "USER", address: B })).toBe(true);
    expect(mayActOnAccount(superadmin, { role: "ADMIN", address: B })).toBe(true);
    expect(mayActOnAccount(superadmin, { role: "SUPERADMIN", address: B })).toBe(false);
  });

  it("never lets anyone act on themselves, whatever the address casing", () => {
    expect(
      mayActOnAccount(
        { role: "SUPERADMIN", address: A },
        { role: "USER", address: A.toUpperCase().replace("0X", "0x") },
      ),
    ).toBe(false);
  });

  it("gives a plain user no control", () => {
    expect(mayActOnAccount({ role: "USER", address: A }, { role: "USER", address: B })).toBe(false);
  });
});

describe("lifecycle helpers", () => {
  it("treats only a non-active lifecycle as recovery", () => {
    expect(isRecoveryLifecycle(undefined)).toBe(false);
    expect(isRecoveryLifecycle("ACTIVE")).toBe(false);
    expect(isRecoveryLifecycle("RETIREMENT_SCHEDULED")).toBe(true);
    expect(isRecoveryLifecycle("ERASED")).toBe(true);
  });

  it("accepts null, scheduled and closed manager closures and nothing else", () => {
    expect(managerClosureSchema.parse(null)).toBeNull();
    expect(
      managerClosureSchema.parse({ state: "SCHEDULED", closesAt: "2027-05-11T00:00:00Z" }),
    ).toEqual({
      state: "SCHEDULED",
      closesAt: "2027-05-11T00:00:00Z",
    });
    expect(managerClosureSchema.parse({ state: "CLOSED", closesAt: null })?.state).toBe("CLOSED");
    expect(managerClosureSchema.safeParse({ state: "OTHER", closesAt: null }).success).toBe(false);
  });

  it("reads a null resource list as empty", () => {
    const preview = accountRetirementPreviewSchema.parse({
      closesAt: "2027-05-11T00:00:00Z",
      recoveryMonths: 6,
      ownedResources: null,
      pendingResourceRequests: 0,
      hiddenContent: { wants: 1, catalogs: 0, posts: 2, reviews: 0 },
      balancesCoverage: "unavailable",
      balancesCoverageNote: "note",
      pendingOperationsNote: "note",
    });
    expect(preview.ownedResources).toEqual([]);
  });
});
