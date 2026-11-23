import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: true, session: { address: "0x123", role: "USER" } },
  canManage: false,
  publicList: vi.fn(),
  managedList: vi.fn(),
  usage: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({ useAuthStatus: () => mocks.auth }));
vi.mock("#/features/auth/hooks/use-profile", () => ({ useAuthProfile: () => ({}) }));
vi.mock("#/features/ownership/hooks/use-asset-owner-info", () => ({
  useAssetOwnerInfo: () => ({ canManage: mocks.canManage }),
}));
vi.mock("#/features/home/hooks/use-voucher-offerings", () => ({
  useVoucherOfferingsInfinite: mocks.publicList,
  useManagedVoucherOfferingsInfinite: mocks.managedList,
}));
vi.mock("#/features/wallet/hooks/use-offering-mutations", () => ({
  useDeleteVoucherOffering: () => ({ mutateAsync: mocks.remove }),
}));
vi.mock("#/hooks/use-resource-usage", () => ({ useResourceUsage: mocks.usage }));
vi.mock("#/lib/api/storage", () => ({ isStorageConfigured: false }));

import { useVoucherOfferingsManager } from "./use-voucher-offerings-manager";

const VOUCHER = "0x2222222222222222222222222222222222222222";
const OWNER = "0x1111111111111111111111111111111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.isAuthenticated = true;
  mocks.auth.session.role = "USER";
  mocks.canManage = false;
  mocks.usage.mockImplementation((enabled: boolean) => ({
    isError: false,
    data: enabled ? { offers: { canCreate: true } } : undefined,
  }));
});

describe("Voucher Offering edit capabilities", () => {
  it.each(["ADMIN", "SUPERADMIN"])("permits %s to edit without owner creation rights", (role) => {
    mocks.auth.session.role = role;
    const { result } = renderHook(() =>
      useVoucherOfferingsManager({ voucherAddress: VOUCHER, ownerAddress: OWNER }),
    );

    expect(result.current).toMatchObject({ canEdit: true, isOwner: false, canCreate: false });
    expect(mocks.managedList).toHaveBeenCalledWith(VOUCHER);
    expect(mocks.publicList).toHaveBeenCalledWith(undefined);
  });

  it("requires authentication and respects a read-only Voucher view", () => {
    mocks.auth.session.role = "ADMIN";
    mocks.auth.isAuthenticated = false;
    const { result, rerender } = renderHook(
      ({ readOnly }) =>
        useVoucherOfferingsManager({ voucherAddress: VOUCHER, ownerAddress: OWNER, readOnly }),
      {
        initialProps: { readOnly: false },
      },
    );

    expect(result.current).toMatchObject({ canEdit: false, isOwner: false });
    expect(mocks.publicList).toHaveBeenCalledWith(VOUCHER);
    mocks.auth.isAuthenticated = true;
    mocks.canManage = true;
    rerender({ readOnly: true });
    expect(result.current).toMatchObject({ canEdit: false, isOwner: false });
    rerender({ readOnly: false });
    expect(result.current).toMatchObject({ canEdit: true, isOwner: true, canCreate: true });
  });
});
