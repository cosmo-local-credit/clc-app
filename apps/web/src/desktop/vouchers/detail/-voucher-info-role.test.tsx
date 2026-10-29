import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const auth = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const owner = vi.hoisted(() => ({ canManage: false }));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => auth.current,
}));
vi.mock("#/features/ownership/hooks/use-asset-owner-info", () => ({
  useAssetOwnerInfo: () => ({ info: undefined, canManage: owner.canManage }),
}));

import type { MarketVoucherDetail } from "@clc/api/features/market/client";

import { useCanEditVoucher } from "./voucher-info";

const VOUCHER = "0x3fA1000000000000000000000000000000000c92";
const detail = {
  ownerAddress: "0x2a22f9c3b484c3629090FeED35F17Ff8F88f76F0",
} as unknown as MarketVoucherDetail;

function canEdit(role: string | undefined, canManage = false) {
  auth.current = {
    isAuthenticated: true,
    session: { address: "0x1111111111111111111111111111111111111111", role },
  };
  owner.canManage = canManage;
  return renderHook(() => useCanEditVoucher(VOUCHER, detail)).result.current.canEdit;
}

describe("useCanEditVoucher", () => {
  it("lets either administrative role correct a voucher it does not own", () => {
    expect(canEdit("ADMIN")).toBe(true);
    expect(canEdit("SUPERADMIN")).toBe(true);
  });

  it("leaves an ordinary account to the owner or a signer for the owner", () => {
    expect(canEdit("USER")).toBe(false);
    expect(canEdit(undefined)).toBe(false);
    expect(canEdit("USER", true)).toBe(true);
  });
});
