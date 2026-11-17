import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("#/components/auth/authenticated-details-gate", () => ({
  AuthenticatedDetailsGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("#/components/messaging/resource-owner-contact", () => ({
  ResourceOwnerContactValue: ({ ownerAddress }: { ownerAddress: string }) => (
    <span data-testid="voucher-owner-contact">{ownerAddress}</span>
  ),
}));
vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({
    isAuthenticated: true,
    session: { address: "0x9999999999999999999999999999999999999999" },
  }),
}));
vi.mock("#/features/ownership/hooks/use-asset-owner-info", () => ({
  useAssetOwnerInfo: () => ({ info: undefined, canManage: false }),
}));
vi.mock("wagmi", () => ({ useConnection: () => ({ address: undefined }) }));
vi.mock("./voucher-controls", () => ({ VoucherOwnerControls: () => null }));

import { VoucherInfoDesk } from "./voucher-info";

const ADDRESS = "0xAbC0000000000000000000000000000000000123";
const OWNER = "0xDeF0000000000000000000000000000000000456";
const detail = {
  address: ADDRESS,
  symbol: "KLP",
  decimals: 6,
  ownerAddress: OWNER,
  voucherValue: "1",
  voucherUoa: "KES",
  description: "Local services",
  email: null,
  website: null,
  phone: null,
  terms: null,
  locationName: null,
  lat: null,
  lng: null,
} as unknown as MarketVoucherDetail;

describe("VoucherInfoDesk owner contact", () => {
  it("keeps one Issuer row and embeds its messageable identity", () => {
    render(
      <VoucherInfoDesk
        address={ADDRESS}
        symbol="KLP"
        decimals={6}
        ownerAddress={OWNER}
        detail={detail}
      />,
    );

    expect(screen.getAllByText("Issuer")).toHaveLength(1);
    const label = screen.getByText("Issuer");
    const value = label.nextElementSibling;
    if (!(value instanceof HTMLElement)) throw new Error("expected Issuer value cell");
    expect(within(value).getByTestId("voucher-owner-contact").textContent).toBe(OWNER);
  });
});
