import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import type { PoolVoucher } from "@clc/api/features/pools/client";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: Record<string, unknown> & { children?: ReactNode }) => (
    <a {...(props as React.ComponentProps<"a">)}>{children}</a>
  ),
}));

vi.mock("#/features/home/hooks/use-voucher-offerings", () => ({
  useVoucherOfferingsInfinite: () => ({
    data: { pages: [{ offerings: [] }] },
    isPending: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  }),
}));

vi.mock("#/lib/default-maps", () => ({
  openDefaultMaps: vi.fn(),
}));

import { openDefaultMaps } from "#/lib/default-maps";
import { PoolVoucherExploreSheet } from "./pool-voucher-explore-sheet";

const VOUCHER: PoolVoucher = {
  id: "1",
  chainId: 100,
  name: "Mama Asha Soap",
  description: "10 bars of locally produced soap",
  symbol: "SOAP",
  tokenAddress: "0x2222222222222222222222222222222222222222",
  decimals: 6,
  ownerAddress: null,
  voucherType: null,
  voucherUoa: "KES",
  voucherValue: "1",
  locationName: "Kariobangi, Nairobi",
  geoLat: -1.26,
  geoLng: 36.89,
  iconUrl: "https://cdn.example/soap.png",
  bannerUrl: null,
  active: true,
  internal: false,
  isAllowed: true,
  tokenLimit: null,
  oracleFeedId: null,
  oracleName: null,
  oracleAddress: null,
  offerCount: 0,
  availableOfferCount: 0,
  tags: ["Soap", "Household"],
};

function renderSheet(
  overrides: Partial<React.ComponentProps<typeof PoolVoucherExploreSheet>> = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <div className="relative h-[800px]">
        <PoolVoucherExploreSheet
          poolAddress="0x1111111111111111111111111111111111111111"
          voucher={VOUCHER}
          availableValue={{ value: "4250", unit: "KES" }}
          availableLoading={false}
          snap="peek"
          onSnapChange={vi.fn()}
          onClose={vi.fn()}
          {...overrides}
        />
      </div>
    </QueryClientProvider>,
  );
}

describe("PoolVoucherExploreSheet", () => {
  it("shows the display name, available value, and Swap without a token symbol", () => {
    renderSheet();
    const sheet = screen.getByRole("region", { name: "Mama Asha Soap" });
    expect(sheet.textContent).toContain("KES 4,250 available");
    expect(sheet.textContent).not.toContain("SOAP");
    expect(screen.getByText("Swap")).toBeTruthy();
  });

  it("opens directions when the voucher has a location", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Directions" }));
    expect(openDefaultMaps).toHaveBeenCalledWith({
      label: "Kariobangi, Nairobi",
      lat: -1.26,
      lng: 36.89,
    });
  });

  it("disables Swap and Directions in the empty states", () => {
    renderSheet({
      voucher: { ...VOUCHER, geoLat: null, geoLng: null, locationName: null },
      availableValue: null,
    });
    expect(screen.getByRole("button", { name: "Directions" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Swap" })).toHaveProperty("disabled", true);
    expect(screen.getByText("No value currently available")).toBeTruthy();
    expect(screen.getByText("No offerings have been added yet.")).toBeTruthy();
  });
});
