import type { UserPool } from "@clc/api/features/pools/client";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("#/components/auth/authenticated-details-gate", () => ({
  AuthenticatedDetailsGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("#/components/messaging/resource-owner-contact", () => ({
  ResourceOwnerContactValue: ({ ownerAddress }: { ownerAddress: string }) => (
    <span data-testid="pool-owner-contact">{ownerAddress}</span>
  ),
}));

import { PoolInfoDesk } from "./pool-info-desk";

const OWNER = "0xDeF0000000000000000000000000000000000456";
const pool = {
  id: "7",
  active: true,
  chainId: 100,
  address: "0xAbC0000000000000000000000000000000000123",
  name: "Kilifi Pool",
  symbol: "KLP",
  ownerAddress: OWNER,
  feePpm: 0,
  feeAddress: null,
  tokenRegistryAddress: null,
  limiterAddress: null,
  quoterAddress: null,
  quoterType: null,
  feePolicyAddress: null,
  protocolFeeControllerAddress: null,
  feesDecoupled: false,
  decimals: 18,
  description: "",
  unitOfAccount: "KES",
  email: null,
  website: null,
  phone: null,
  terms: null,
  locationName: null,
  geoLat: null,
  geoLng: null,
  imageUrl: null,
  bannerUrl: null,
  defaultVoucherId: null,
  voucherCount: 0,
  tags: [],
} satisfies UserPool;

describe("PoolInfoDesk", () => {
  it("places the owner contact inside the Details rows", () => {
    render(<PoolInfoDesk pool={pool} />);

    const label = screen.getByText("Owner");
    const value = label.nextElementSibling;
    if (!(value instanceof HTMLElement)) throw new Error("expected Owner value cell");
    expect(within(value).getByTestId("pool-owner-contact").textContent).toBe(OWNER);
    expect(screen.getAllByTestId("pool-owner-contact")).toHaveLength(1);
  });
});
